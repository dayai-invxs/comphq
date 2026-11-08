import { parseLookupCsv } from '@/lib/lookupCsv'

// The volunteers' import: Name, Role. A name already on the roster updates
// that volunteer rather than adding a second one, as the athletes' import
// does. A blank role cell keeps the role they have; the sheet's default role
// is only for someone new.

export interface ExistingVolunteer {
  id: number
  name: string
  roleId: number | null
}

export interface VolunteerLine {
  name: string
  roleId: number | null
  /** The volunteer this line updates, or null for a new one. */
  id: number | null
  action: 'create' | 'update' | 'unchanged'
}

const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ')

export function parseVolunteerCsv(
  text: string,
  roles: { id: number; name: string }[],
  fallback: number | null,
  existing: ExistingVolunteer[] = [],
): { lines: VolunteerLine[]; unknown: string[]; problems: string[] } {
  const { lines: parsed, unknown } = parseLookupCsv(text, roles, 1, null)
  const problems: string[] = []

  const onRoster = new Map<string, ExistingVolunteer[]>()
  for (const v of existing) {
    const key = nameKey(v.name)
    onRoster.set(key, [...(onRoster.get(key) ?? []), v])
  }

  const seen = new Set<string>()
  const lines: VolunteerLine[] = []
  for (const { name, cells, refId } of parsed) {
    const key = nameKey(name)
    if (seen.has(key)) problems.push(`"${name}" appears more than once in the list.`)
    seen.add(key)

    const sameName = onRoster.get(key) ?? []
    if (sameName.length > 1) {
      problems.push(`"${name}" matches ${sameName.length} volunteers already on the roster. Rename one so they can be told apart.`)
      continue
    }
    const match = sameName[0]
    const roleNamed = !!cells[1]?.trim()
    const roleId = roleNamed ? refId : match ? match.roleId : fallback

    if (!match) {
      lines.push({ name, roleId, id: null, action: 'create' })
      continue
    }
    const unchanged = match.name === name && match.roleId === roleId
    lines.push({ name, roleId, id: match.id, action: unchanged ? 'unchanged' : 'update' })
  }

  return { lines, unknown, problems: [...new Set(problems)] }
}
