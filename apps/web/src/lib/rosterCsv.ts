import type { Gender } from '@/api/athletes'
import type { Division } from '@/api/divisions'
import { parseCsv } from '@/lib/csv'
import { isTeam } from '@/lib/teams'

// A pasted or dropped roster. With a header row, columns are found by title, so
// they can come in any order and any but Name can be left out. Without one, a
// line is Name, Bib, Division by position, and anything further needs titles.
//
// Whether a line is a team is its division's say. A value the line's division
// has no place for stops the import rather than being dropped: nothing a person
// typed into the file goes missing without them being told.
//
// A line naming someone already on the roster updates them; only a name that is
// not there creates anyone, so a corrected file can be uploaded again. The file
// only ever adds information: a column left out or a cell left blank keeps what
// the entry has, so a re-upload cannot wipe a bib. Listing any member replaces
// the team's list, because the list is the one thing a row states as a whole.

type Member = { name: string; gender: Gender | null }

/** What the roster already holds for one entry. */
export interface ExistingEntry {
  id: number
  name: string
  bibNumber: string | null
  divisionId: number | null
  gender: Gender | null
  members: Member[]
}

export interface RosterLine {
  /** The entry this line updates; null creates a new one. */
  id: number | null
  /** 'unchanged' means the entry already says everything the line does. */
  action: 'create' | 'update' | 'unchanged'
  name: string
  bibNumber: string | null
  divisionId: number | null
  /** Set only on an individual. */
  gender: Gender | null
  /** Set only on a team whose row lists people, in Member number order. Null
      leaves the team's list alone. */
  members: Member[] | null
}

export interface RosterImport {
  lines: RosterLine[]
  /** Division names that match nothing, each once. */
  unknown: string[]
  /** Everything else that stops the import, in words an admin can act on. */
  problems: string[]
}

type Column =
  | { field: 'name' | 'bib' | 'division' | 'gender' }
  | { field: 'memberName' | 'memberGender'; member: number }

const FIELDS: Record<string, Column> = {
  name: { field: 'name' },
  'team name': { field: 'name' },
  'athlete name': { field: 'name' },
  bib: { field: 'bib' },
  'bib #': { field: 'bib' },
  'bib number': { field: 'bib' },
  division: { field: 'division' },
  gender: { field: 'gender' },
}

function readTitle(title: string): Column | null {
  const key = title.toLowerCase().replace(/\s+/g, ' ')
  if (FIELDS[key]) return FIELDS[key]
  const member = /^member (\d+)( name| gender)?$/.exec(key)
  if (!member || Number(member[1]) < 1) return null
  return { field: member[2] === ' gender' ? 'memberGender' : 'memberName', member: Number(member[1]) }
}

const columnKey = (c: Column) => ('member' in c ? `${c.field}${c.member}` : c.field)

const GENDERS: Record<string, Gender> = { f: 'female', female: 'female', m: 'male', male: 'male' }

const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ')

const sameMembers = (a: Member[], b: Member[]) =>
  a.length === b.length && a.every((m, i) => m.name === b[i].name && m.gender === b[i].gender)

export function parseRosterCsv(
  text: string,
  divisions: Pick<Division, 'id' | 'name' | 'teamSize' | 'menCount' | 'womenCount'>[],
  fallback: number | null,
  existing: ExistingEntry[] = [],
): RosterImport {
  const byName = new Map(divisions.map((d) => [d.name.toLowerCase(), d]))
  const byId = new Map(divisions.map((d) => [d.id, d]))
  const rows = parseCsv(text)
  const problems: string[] = []

  const onRoster = new Map<string, ExistingEntry[]>()
  for (const entry of existing) {
    const key = nameKey(entry.name)
    onRoster.set(key, [...(onRoster.get(key) ?? []), entry])
  }
  // The same name can be two people in two divisions, so a named division picks
  // between them. With only one person of that name, it is them, and a different
  // division is a move. Anything less certain than that is a question, not a guess.
  const findExisting = (name: string, divisionId: number | undefined, label: string) => {
    const sameName = onRoster.get(nameKey(name)) ?? []
    const sameDivision = sameName.filter((e) => e.divisionId === divisionId)
    if (sameDivision.length === 1) return sameDivision[0]
    if (sameName.length === 1) return sameName[0]
    if (sameName.length > 1) {
      problems.push(`${label} matches ${sameName.length} entries already on the roster. ${
        sameDivision.length > 1 ? 'Rename one so they can be told apart.' : 'Name a division to pick one.'
      }`)
    }
    return null
  }
  const claimed = new Set<string>()

  const hasHeader = rows[0]?.some((cell) => readTitle(cell) != null) ?? false
  let columns: (Column | null)[] = [{ field: 'name' }, { field: 'bib' }, { field: 'division' }]
  let header: string[] = []
  if (hasHeader) {
    header = rows.shift()!
    const seen = new Set<string>()
    columns = header.map((title) => {
      if (!title) return null
      const column = readTitle(title)
      if (!column) {
        problems.push(`Unknown column "${title}". Rename it or remove it.`)
        return null
      }
      if (seen.has(columnKey(column))) problems.push(`Column "${title}" appears twice.`)
      seen.add(columnKey(column))
      return column
    })
    if (!seen.has('name')) problems.push('The list needs a Name column.')
  }

  const lines: RosterLine[] = []
  const unknown = new Map<string, string>()

  rows.forEach((cells, index) => {
    if (cells.every((cell) => !cell)) return
    const rowNumber = index + (hasHeader ? 2 : 1)

    const values: Partial<Record<'name' | 'bib' | 'division' | 'gender', string>> = {}
    const memberCells = new Map<number, { name: string; gender: string }>()
    let overflow = false
    cells.forEach((cell, i) => {
      if (!cell) return
      const column = columns[i]
      if (!column) {
        // An unknown title was already reported, once, for the whole column.
        if (!header[i]) overflow = true
        return
      }
      if ('member' in column) {
        const member = memberCells.get(column.member) ?? { name: '', gender: '' }
        if (column.field === 'memberName') member.name = cell
        else member.gender = cell
        memberCells.set(column.member, member)
      } else {
        values[column.field] = cell
      }
    })

    const name = values.name ?? ''
    const label = name ? `"${name}"` : `Row ${rowNumber}`
    if (overflow) {
      problems.push(hasHeader
        ? `${label} has a value in a column with no title. If a name contains a comma, put it in quotes.`
        : `${label} has more than Name, Bib, Division. Add a header row to use other columns.`)
    }
    if (!name) problems.push(`${label} has no name.`)

    const readGender = (raw: string, whose: string): Gender | null => {
      if (!raw) return null
      const gender = GENDERS[raw.toLowerCase()]
      if (!gender) problems.push(`${whose} has gender "${raw}". Use M, F, Male or Female.`)
      return gender ?? null
    }

    const gender = readGender(values.gender ?? '', label)
    const members = [...memberCells.entries()]
      .sort(([a], [b]) => a - b)
      .flatMap(([number, member]) => {
        const whose = `${label} member ${number}`
        const memberGender = readGender(member.gender, whose)
        if (!member.name) {
          problems.push(`${whose} has a gender but no name.`)
          return []
        }
        return [{ name: member.name, gender: memberGender }]
      })

    const divisionName = values.division ?? ''
    const named = divisionName ? byName.get(divisionName.toLowerCase()) : undefined
    if (divisionName && !named) {
      unknown.set(divisionName.toLowerCase(), unknown.get(divisionName.toLowerCase()) ?? divisionName)
      return
    }
    const match = name ? findExisting(name, named?.id, label) : null
    const divisionId = named?.id ?? match?.divisionId ?? fallback
    const division = divisionId != null ? byId.get(divisionId) : undefined
    const team = isTeam(division)

    if (team) {
      if (gender) problems.push(`${label} is a team, so its Gender column should be blank. Give each member a gender instead.`)
    } else if (memberCells.size > 0) {
      const where = division ? `"${division.name}" is not a team division` : 'it has no division'
      problems.push(`${label} lists team members, but ${where}.`)
    }

    if (!name) return

    const claim = match ? `id:${match.id}` : `new:${nameKey(name)}:${divisionId}`
    if (claimed.has(claim)) problems.push(`${label} appears more than once in the list.`)
    claimed.add(claim)

    // A person the file lists with no gender keeps the one they have.
    const listed = team && members.length > 0
      ? members.map((m) => ({
          name: m.name,
          gender: m.gender ?? match?.members.find((had) => nameKey(had.name) === nameKey(m.name))?.gender ?? null,
        }))
      : null
    const line = {
      name,
      bibNumber: values.bib ?? match?.bibNumber ?? null,
      divisionId,
      gender: team ? null : gender ?? match?.gender ?? null,
      members: listed,
    }
    const unchanged = match != null
      && line.name === match.name
      && line.bibNumber === match.bibNumber
      && line.divisionId === match.divisionId
      && line.gender === match.gender
      && (listed == null || sameMembers(listed, match.members))
    lines.push({
      ...line,
      id: match?.id ?? null,
      action: !match ? 'create' : unchanged ? 'unchanged' : 'update',
    })
  })

  return { lines, unknown: [...unknown.values()], problems: [...new Set(problems)] }
}
