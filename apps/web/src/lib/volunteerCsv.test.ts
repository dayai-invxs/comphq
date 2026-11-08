import { describe, expect, it } from 'vitest'
import { parseVolunteerCsv } from './volunteerCsv'

const ROLES = [{ id: 5, name: 'Judge' }, { id: 6, name: 'Marshal' }]
const ROSTER = [
  { id: 8, name: 'Jo Jones', roleId: 5 },
  { id: 9, name: 'Kit King', roleId: null },
]

describe('parseVolunteerCsv', () => {
  it('adds a name that is not on the roster, with the default role when none is named', () => {
    const { lines } = parseVolunteerCsv('Lee Lang\nMo Moss, Judge', ROLES, 6, ROSTER)
    expect(lines).toEqual([
      { name: 'Lee Lang', roleId: 6, id: null, action: 'create' },
      { name: 'Mo Moss', roleId: 5, id: null, action: 'create' },
    ])
  })

  it('matches a name already on the roster regardless of case and spacing', () => {
    const { lines } = parseVolunteerCsv('jo  jones, Marshal', ROLES, null, ROSTER)
    expect(lines).toEqual([{ name: 'jo  jones', roleId: 6, id: 8, action: 'update' }])
  })

  it('leaves a re-uploaded volunteer unchanged, and a blank role keeps the one they have', () => {
    const { lines } = parseVolunteerCsv('Name, Role\nJo Jones\nKit King,', ROLES, 6, ROSTER)
    expect(lines.map((l) => [l.id, l.roleId, l.action])).toEqual([
      [8, 5, 'unchanged'],
      [9, null, 'unchanged'],
    ])
  })

  it('flags a name listed twice', () => {
    const { problems } = parseVolunteerCsv('Lee Lang\nlee lang, Judge', ROLES, null, ROSTER)
    expect(problems).toEqual(['"lee lang" appears more than once in the list.'])
  })

  it('flags a name that matches two volunteers already on the roster', () => {
    const roster = [...ROSTER, { id: 10, name: 'Jo Jones', roleId: null }]
    const { lines, problems } = parseVolunteerCsv('Jo Jones', ROLES, null, roster)
    expect(lines).toEqual([])
    expect(problems[0]).toMatch(/matches 2 volunteers/)
  })

  it('reports an unknown role', () => {
    const { unknown, lines } = parseVolunteerCsv('Jo Jones, Timer', ROLES, null, ROSTER)
    expect(unknown).toEqual(['Timer'])
    expect(lines).toEqual([])
  })
})
