import { describe, expect, it } from 'vitest'
import { parseRosterCsv } from './rosterCsv'

const DIVISIONS = [
  { id: 3, name: 'Rx', teamSize: 1, menCount: null, womenCount: null },
  { id: 5, name: 'Team Rx', teamSize: 2, menCount: 1, womenCount: 1 },
]

const parse = (text: string, fallback: number | null = null) => parseRosterCsv(text, DIVISIONS, fallback)

describe('parseRosterCsv', () => {
  it('reads a team and its members, each in their own columns', () => {
    const { lines, problems } = parse(
      'Name, Bib, Division, Gender, Member 1, Member 1 Gender, Member 2, Member 2 Gender\n' +
      'Team Rocket, 12, team rx, , Ann Lee, F, Bob Ray, male',
    )
    expect(problems).toEqual([])
    expect(lines).toEqual([{
      id: null,
      action: 'create',
      name: 'Team Rocket',
      bibNumber: '12',
      divisionId: 5,
      gender: null,
      members: [{ name: 'Ann Lee', gender: 'female' }, { name: 'Bob Ray', gender: 'male' }],
    }])
  })

  it('reads an individual from the same list, with a gender', () => {
    const { lines, problems } = parse('Name, Division, Gender, Member 1\nJane Doe, Rx, F,')
    expect(problems).toEqual([])
    expect(lines).toEqual([{ id: null, action: 'create', name: 'Jane Doe', bibNumber: null, divisionId: 3, gender: 'female', members: null }])
  })

  it('finds columns by title, so Bib can be left out and order does not matter', () => {
    const { lines } = parse('Division, Team Name\nRx, Jane Doe')
    expect(lines[0]).toMatchObject({ name: 'Jane Doe', bibNumber: null, divisionId: 3 })
  })

  it('takes "Member 1 Name" as well as "Member 1", and orders members by number', () => {
    const { lines } = parse('Name, Division, Member 2 Name, Member 1 Name\nDuo, Team Rx, Second, First')
    expect(lines[0].members?.map((m) => m.name)).toEqual(['First', 'Second'])
  })

  it('keeps a team with nobody listed', () => {
    const { lines, problems } = parse('Name, Division, Member 1\nDuo, Team Rx,')
    expect(problems).toEqual([])
    expect(lines[0].members).toBeNull()
  })

  it('still reads a list with no header as Name, Bib, Division', () => {
    const { lines } = parse('Cy Cole, 9, rx\nDi Dean', 5)
    expect(lines.map((l) => [l.name, l.bibNumber, l.divisionId])).toEqual([['Cy Cole', '9', 3], ['Di Dean', null, 5]])
  })

  it('uses the default division to decide a row is a team', () => {
    const { lines, problems } = parse('Name, Member 1\nDuo, Ann Lee', 5)
    expect(problems).toEqual([])
    expect(lines[0]).toMatchObject({ divisionId: 5, members: [{ name: 'Ann Lee', gender: null }] })
  })

  it('skips rows a spreadsheet left empty', () => {
    const { lines, problems } = parse('Name, Bib\nCy Cole, 9\n,,\n')
    expect(problems).toEqual([])
    expect(lines).toHaveLength(1)
  })

  it('reports each unknown division once', () => {
    const { lines, unknown } = parse('Name, Division\nA, Teens\nB, teens\nC, Rx')
    expect(unknown).toEqual(['Teens'])
    expect(lines.map((l) => l.name)).toEqual(['C'])
  })

  it('reports an unknown column once, however many rows fill it', () => {
    expect(parse('Name, Email\nA, a@x.io\nB, b@x.io').problems).toEqual(['Unknown column "Email". Rename it or remove it.'])
  })

  it.each([
    ['an unknown column', 'Name, Email\nCy, c@x.io', 'Unknown column "Email"'],
    ['a repeated column', 'Name, Bib, Bib #\nCy, 1, 2', 'Column "Bib #" appears twice'],
    ['a header with no name', 'Bib, Division\n9, Rx', 'needs a Name column'],
    ['a row with no name', 'Name, Bib\n, 9', 'Row 2 has no name'],
    ['a value under no title', 'Name, Bib,\nDoe, Jane, 9', 'column with no title'],
    ['too many cells with no header', 'Cy, 9, Rx, F', 'Add a header row'],
    ['an unreadable gender', 'Name, Gender\nCy, X', 'gender "X"'],
    ['members on an individual', 'Name, Division, Member 1\nCy, Rx, Ann', '"Rx" is not a team division'],
    ['members with no division', 'Name, Member 1\nCy, Ann', 'it has no division'],
    ['a gender on a team', 'Name, Division, Gender\nDuo, Team Rx, F', 'is a team'],
    ['a member gender with no name', 'Name, Division, Member 1, Member 1 Gender\nDuo, Team Rx, , F', 'member 1 has a gender but no name'],
  ])('stops on %s', (_case, text, message) => {
    expect(parse(text).problems.join(' ')).toContain(message)
  })

  describe('uploading over a roster', () => {
    const JANE = { id: 1, name: 'Jane Doe', bibNumber: '42', divisionId: 3, gender: 'female' as const, members: [] }
    const DUO = {
      id: 2, name: 'Duo', bibNumber: '7', divisionId: 5, gender: null,
      members: [{ name: 'Ann Lee', gender: 'female' as const }, { name: 'Bob Ray', gender: 'male' as const }],
    }
    const over = (text: string, existing: Parameters<typeof parseRosterCsv>[3] = [JANE, DUO], fallback: number | null = null) =>
      parseRosterCsv(text, DIVISIONS, fallback, existing)

    it('updates a name already there, ignoring case and spacing', () => {
      const { lines } = over('Name, Bib\n  jane   DOE , 99')
      expect(lines[0]).toMatchObject({ id: 1, action: 'update', name: 'jane   DOE', bibNumber: '99' })
    })

    it('creates a name that is not there', () => {
      expect(over('Name, Division\nNew Person, Rx').lines[0]).toMatchObject({ id: null, action: 'create', divisionId: 3 })
    })

    it('keeps what a left-out column or blank cell does not mention', () => {
      const { lines } = over('Name, Bib, Division, Gender\nJane Doe, , ,')
      expect(lines[0]).toMatchObject({ bibNumber: '42', divisionId: 3, gender: 'female', action: 'unchanged' })
      expect(over('Name\nDuo').lines[0]).toMatchObject({ bibNumber: '7', divisionId: 5, members: null, action: 'unchanged' })
    })

    it('marks a row identical to the roster as unchanged', () => {
      const { lines } = over('Name, Bib, Division, Member 1, Member 1 Gender, Member 2, Member 2 Gender\nDuo, 7, Team Rx, Ann Lee, F, Bob Ray, M')
      expect(lines[0].action).toBe('unchanged')
    })

    it('replaces a team list when members are listed, keeping a gender left blank', () => {
      const { lines } = over('Name, Member 1, Member 2, Member 2 Gender\nDuo, Ann Lee, Cy Cole, M')
      expect(lines[0]).toMatchObject({
        action: 'update',
        members: [{ name: 'Ann Lee', gender: 'female' }, { name: 'Cy Cole', gender: 'male' }],
      })
    })

    it('reads an existing team as a team with no division named or picked', () => {
      const { problems, lines } = over('Name, Member 1\nDuo, Ann Lee')
      expect(problems).toEqual([])
      expect(lines[0].divisionId).toBe(5)
    })

    it('moves the only person of that name to the division named', () => {
      expect(over('Name, Division\nJane Doe, Team Rx').lines[0]).toMatchObject({ id: 1, divisionId: 5, gender: null, action: 'update' })
    })

    it('uses the default division only for an entry that has none', () => {
      expect(over('Name\nJane Doe', [JANE], 5).lines[0].divisionId).toBe(3)
      expect(over('Name\nJane Doe', [{ ...JANE, divisionId: null, gender: null }], 3).lines[0]).toMatchObject({ divisionId: 3, action: 'update' })
    })

    it('tells two of the same name apart by division', () => {
      const twin = { ...JANE, id: 8, divisionId: 5, gender: null }
      expect(over('Name, Division\nJane Doe, Team Rx', [JANE, twin]).lines[0].id).toBe(8)
    })

    it('stops when two of the same name cannot be told apart', () => {
      const twin = { ...JANE, id: 8, divisionId: 5, gender: null }
      expect(over('Name\nJane Doe', [JANE, twin]).problems.join(' ')).toContain('Name a division to pick one')
      expect(over('Name, Division\nJane Doe, Rx', [JANE, { ...JANE, id: 8 }]).problems.join(' ')).toContain('Rename one')
    })

    it('stops when two rows would land on one entry', () => {
      expect(over('Name, Bib\nJane Doe, 1\njane doe, 2').problems.join(' ')).toContain('appears more than once')
      expect(over('Name, Division\nNew, Rx\nNew, Rx').problems.join(' ')).toContain('appears more than once')
    })

    it('allows two new people of one name in two divisions', () => {
      expect(over('Name, Division\nNew, Rx\nNew, Team Rx').problems).toEqual([])
    })
  })
})
