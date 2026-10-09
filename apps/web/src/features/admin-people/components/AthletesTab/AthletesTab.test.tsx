import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AthletesTab } from './AthletesTab'
import type { Athlete, Division } from '../../usePeople'

const { apiDel, apiPost, apiPut } = vi.hoisted(() => ({
  apiDel: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ apiDel, apiPost, apiPut }))

// v1: the athletes half of src/app/[slug]/admin/people/page.tsx.

const DIVISIONS: Division[] = [
  { id: 3, name: 'Rx', order: 1, teamSize: 1, menCount: null, womenCount: null },
  { id: 4, name: 'Scaled', order: 2, teamSize: 1, menCount: null, womenCount: null },
]
const ATHLETES: Athlete[] = [
  { id: 1, competitionId: 1, name: 'Ann Adams', bibNumber: '7', divisionId: 3, division: DIVISIONS[0], withdrawn: false, userId: null, gender: null, members: [] },
  { id: 2, competitionId: 1, name: 'Bo Barnes', bibNumber: null, divisionId: null, division: null, withdrawn: true, userId: null, gender: null, members: [] },
]

function draw(over: { athletes?: Athlete[]; divisions?: Division[]; adding?: boolean; loading?: boolean } = {}) {
  const run = vi.fn(async (_label: string, op: () => Promise<unknown>) => {
    try { return await op() } catch { return undefined }
  })
  const reload = vi.fn(async () => {})
  const setAthletes = vi.fn()
  const onCloseAdd = vi.fn()
  render(
    <AthletesTab
      slug="rugged-rumble"
      athletes={over.athletes ?? ATHLETES}
      divisions={over.divisions ?? DIVISIONS}
      loading={over.loading ?? false}
      setLoading={vi.fn()}
      run={run as never}
      reload={reload}
      setAthletes={setAthletes}
      adding={over.adding ?? false}
      onCloseAdd={onCloseAdd}
    />,
  )
  return { run, reload, setAthletes, onCloseAdd }
}

const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) })
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))

/** The editor, which is a sheet beside the roster rather than the row itself. */
const sheet = (name: string) => within(screen.getByRole('dialog', { name }))
/** A question, which is not the same thing as an editor. */
const asked = (name: string) => within(screen.getByRole('alertdialog', { name }))
const openEditor = (name: string) => fireEvent.click(within(row(name)).getByRole('button', { name: 'Edit' }))

beforeEach(() => {
  vi.clearAllMocks()
  apiPost.mockResolvedValue({})
  apiPut.mockResolvedValue({})
  apiDel.mockResolvedValue({})
})

describe('the roster it draws', () => {
  // An empty roster mid-read is not "No athletes yet".
  it('shows a shimmer rather than an empty roster while the reads are out', () => {
    draw({ athletes: [], loading: true })
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(screen.queryByText('No athletes yet')).not.toBeInTheDocument()
  })

  it('lists each athlete with a bib and a division', () => {
    draw()
    expect(within(row('Ann Adams')).getByText('7')).toBeInTheDocument()
    expect(within(row('Ann Adams')).getByText('Rx')).toBeInTheDocument()
  })

  it('draws an em dash where an athlete has neither', () => {
    draw()
    expect(within(row('Bo Barnes')).getAllByText('—')).toHaveLength(2)
  })

  it('marks a withdrawn athlete', () => {
    draw()
    expect(within(row('Bo Barnes')).getByText('Withdrawn')).toBeInTheDocument()
  })

  it('drops the division column when the competition has none', () => {
    draw({ divisions: [] })
    expect(screen.queryByRole('columnheader', { name: 'Division' })).not.toBeInTheDocument()
  })

  // v1 printed nothing at all here. An empty roster is the one state that
  // needs a next step spelled out, because there is no row to copy.
  it('says what to do rather than drawing an empty table', () => {
    draw({ athletes: [] })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('No athletes yet')).toBeInTheDocument()
  })

  it('narrows the list to what was searched for', () => {
    draw()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'bo' } })
    expect(screen.queryByRole('row', { name: /Ann Adams/ })).not.toBeInTheDocument()
    expect(row('Bo Barnes')).toBeInTheDocument()
  })
})

describe('adding athletes', () => {
  it('opens on the page asking to add, and not before', () => {
    draw()
    expect(screen.queryByRole('dialog', { name: 'Add athlete' })).not.toBeInTheDocument()
  })

  it('sends one athlete and closes the editor', async () => {
    const { onCloseAdd } = draw({ adding: true })
    const form = sheet('Add athlete')
    fireEvent.change(form.getByRole('textbox', { name: 'Name' }), { target: { value: '  Cy Cole  ' } })
    fireEvent.change(form.getByLabelText('Bib #'), { target: { value: '9' } })
    fireEvent.change(form.getByLabelText('Division'), { target: { value: '4' } })
    press('Add athlete')
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/api/athletes', {
      slug: 'rugged-rumble', name: 'Cy Cole', bibNumber: '9', divisionId: 4, gender: null,
    }))
    expect(onCloseAdd).toHaveBeenCalled()
  })

  it('will not send a nameless athlete', () => {
    draw({ adding: true })
    press('Add athlete')
    expect(apiPost).not.toHaveBeenCalled()
  })

  it('splits each imported line into a name and a bib, under one division', async () => {
    draw({ adding: true })
    const form = sheet('Add athlete')
    fireEvent.click(form.getByRole('radio', { name: 'Import many' }))
    fireEvent.change(form.getByLabelText(/^Default division/), { target: { value: '3' } })
    fireEvent.change(form.getByRole('textbox', { name: /One per line/ }), {
      target: { value: 'Cy Cole, 9\n\nDi Dean\n' },
    })
    press('Import athletes')
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(2))
    expect(apiPost.mock.calls[0][1]).toEqual({ slug: 'rugged-rumble', name: 'Cy Cole', bibNumber: '9', divisionId: 3 })
    expect(apiPost.mock.calls[1][1]).toEqual({ slug: 'rugged-rumble', name: 'Di Dean', bibNumber: null, divisionId: 3 })
  })

  // COM-108. One list can hold every division: a third column names it, and
  // a blank one takes the division picked above.
  it('puts each imported line in the division it names', async () => {
    draw({ adding: true })
    const form = sheet('Add athlete')
    fireEvent.click(form.getByRole('radio', { name: 'Import many' }))
    fireEvent.change(form.getByLabelText(/^Default division/), { target: { value: '3' } })
    fireEvent.change(form.getByRole('textbox', { name: /One per line/ }), {
      target: { value: 'Name, Bib, Division\nCy Cole, 9, scaled\nDi Dean' },
    })
    press('Import athletes')
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(2))
    expect(apiPost.mock.calls[0][1]).toEqual({ slug: 'rugged-rumble', name: 'Cy Cole', bibNumber: '9', divisionId: 4 })
    expect(apiPost.mock.calls[1][1]).toEqual({ slug: 'rugged-rumble', name: 'Di Dean', bibNumber: null, divisionId: 3 })
  })

  it('names a division that does not exist and imports nothing', async () => {
    draw({ adding: true })
    const form = sheet('Add athlete')
    fireEvent.click(form.getByRole('radio', { name: 'Import many' }))
    fireEvent.change(form.getByRole('textbox', { name: /One per line/ }), {
      target: { value: 'Cy Cole, 9, Teens\nDi Dean, , Rx' },
    })
    expect(form.getByRole('alert')).toHaveTextContent('No division named Teens')
    press('Import athletes')
    await new Promise((r) => setTimeout(r, 0))
    expect(apiPost).not.toHaveBeenCalled()
  })

  it('fills the list from a dropped file', async () => {
    draw({ adding: true })
    const form = sheet('Add athlete')
    fireEvent.click(form.getByRole('radio', { name: 'Import many' }))
    const file = new File(['Cy Cole, 9, Rx'], 'athletes.csv', { type: 'text/csv' })
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)
    await waitFor(() => expect(form.getByRole('textbox', { name: /One per line/ })).toHaveValue('Cy Cole, 9, Rx'))
  })
})

describe('changing one athlete', () => {
  it('opens the editor holding what that athlete already is', () => {
    draw()
    openEditor('Ann Adams')
    const form = sheet('Ann Adams')
    expect(form.getByRole('textbox', { name: 'Name' })).toHaveValue('Ann Adams')
    expect(form.getByLabelText('Bib #')).toHaveValue('7')
    expect(form.getByLabelText('Division')).toHaveValue('3')
  })

  it('saves what was typed', async () => {
    draw()
    openEditor('Ann Adams')
    fireEvent.change(sheet('Ann Adams').getByRole('textbox', { name: 'Name' }), { target: { value: 'Anna Adams' } })
    press('Save')
    await waitFor(() => expect(apiPut).toHaveBeenCalledWith('/api/athletes/1?slug=rugged-rumble', {
      name: 'Anna Adams', bibNumber: '7', divisionId: 3, gender: null,
    }))
  })

  it('gives up on the way out without writing anything', () => {
    draw()
    openEditor('Ann Adams')
    fireEvent.change(sheet('Ann Adams').getByRole('textbox', { name: 'Name' }), { target: { value: 'Anna Adams' } })
    press('Cancel')
    expect(apiPut).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Ann Adams' })).not.toBeInTheDocument()
  })

  it('asks once before removing, and names who', async () => {
    draw()
    fireEvent.click(within(row('Ann Adams')).getByRole('button', { name: 'Remove' }))
    expect(apiDel).not.toHaveBeenCalled()
    expect(asked('Remove athlete?').getByText(/Ann Adams/)).toBeInTheDocument()
    press('Remove athlete')
    await waitFor(() => expect(apiDel).toHaveBeenCalledWith('/api/athletes/1?slug=rugged-rumble'))
  })

  // v1's delete swallowed the refusal and dropped the row anyway. The question
  // was asked in the dialog, so the refusal is answered there.
  it('says so in the dialog that asked when the removal is refused', async () => {
    const { setAthletes } = draw()
    apiDel.mockRejectedValue(new Error('Ann is in a scored heat'))
    fireEvent.click(within(row('Ann Adams')).getByRole('button', { name: 'Remove' }))
    press('Remove athlete')
    expect(await screen.findByRole('alert')).toHaveTextContent('Remove athlete: Ann is in a scored heat')
    expect(setAthletes).not.toHaveBeenCalled()
  })

  // Reversible, and the button that reverses it is the same button — so it
  // acts rather than asking. v1 confirmed it inline because it lived in the
  // row, one mis-tap away from the list.
  it('withdraws an athlete, and takes it back the other way round', async () => {
    draw()
    openEditor('Ann Adams')
    fireEvent.click(sheet('Ann Adams').getByRole('button', { name: 'Withdraw' }))
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/api/athletes/1/withdraw?slug=rugged-rumble', {}))

    openEditor('Bo Barnes')
    fireEvent.click(sheet('Bo Barnes').getByRole('button', { name: 'Un-withdraw' }))
    await waitFor(() => expect(apiDel).toHaveBeenCalledWith('/api/athletes/2/withdraw?slug=rugged-rumble'))
  })

  /** What the flip left in the list: the first updater passed to setAthletes,
      applied to the roster as drawn. */
  const flipped = (setAthletes: ReturnType<typeof vi.fn>, call: number) =>
    (setAthletes.mock.calls[call][0] as (prev: Athlete[]) => Athlete[])(ATHLETES)

  // One flag on one row: the row flips where it stands, and nothing reloads.
  it('flips the row before the server answers, without a reload', async () => {
    const { setAthletes, reload } = draw()
    let land!: (v: unknown) => void
    apiPost.mockReturnValue(new Promise((r) => { land = r }))
    openEditor('Ann Adams')
    fireEvent.click(sheet('Ann Adams').getByRole('button', { name: 'Withdraw' }))
    expect(flipped(setAthletes, 0).find((a) => a.id === 1)?.withdrawn).toBe(true)
    land({})
    await waitFor(() => expect(apiPost).toHaveBeenCalled())
    expect(reload).not.toHaveBeenCalled()
    expect(setAthletes).toHaveBeenCalledTimes(1)
  })

  it('takes the flip back when the write is refused', async () => {
    const { setAthletes } = draw()
    apiPost.mockRejectedValue(new Error('scored heat'))
    openEditor('Ann Adams')
    fireEvent.click(sheet('Ann Adams').getByRole('button', { name: 'Withdraw' }))
    await waitFor(() => expect(setAthletes).toHaveBeenCalledTimes(2))
    expect(flipped(setAthletes, 1).find((a) => a.id === 1)?.withdrawn).toBe(false)
  })

  it('replaces one athlete with another', async () => {
    draw()
    openEditor('Ann Adams')
    const form = sheet('Ann Adams')
    fireEvent.change(form.getByRole('combobox', { name: 'Replace Ann Adams with' }), { target: { value: '2' } })
    fireEvent.click(form.getByRole('button', { name: 'Replace' }))
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/api/athletes/1/swap?slug=rugged-rumble', { newAthleteId: 2 }))
  })

  it('offers every athlete but the one being replaced', () => {
    draw()
    openEditor('Ann Adams')
    const picker = sheet('Ann Adams').getByRole('combobox', { name: 'Replace Ann Adams with' })
    expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toEqual(['Nobody', 'Bo Barnes'])
  })
})

describe('changing several at once', () => {
  it('deletes the selected athletes once the question is answered', async () => {
    draw()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select every athlete' }))
    press('Delete 2 selected')
    expect(apiDel).not.toHaveBeenCalled()
    press('Delete 2')
    await waitFor(() => expect(apiDel).toHaveBeenCalledWith('/api/athletes', { slug: 'rugged-rumble', ids: [1, 2] }))
  })

  it('offers nothing to do until a row is taken', () => {
    draw()
    expect(screen.queryByRole('button', { name: /Delete .* selected/ })).not.toBeInTheDocument()
  })
})

describe('teams', () => {
  const TEAM_DIVISION: Division = { id: 5, name: 'Teams', order: 3, teamSize: 2, menCount: 1, womenCount: 1 }
  const WITH_TEAMS = [...DIVISIONS, TEAM_DIVISION]
  const team = (over: Partial<Athlete> = {}): Athlete => ({
    id: 9, competitionId: 1, name: 'Java Jams', bibNumber: null, divisionId: 5, division: TEAM_DIVISION,
    withdrawn: false, userId: null, gender: null, members: [], ...over,
  })

  it('asks for a team name and members once a team division is picked', () => {
    draw({ adding: true, divisions: WITH_TEAMS })
    const form = sheet('Add athlete')
    expect(form.queryByRole('textbox', { name: 'Team name' })).not.toBeInTheDocument()
    fireEvent.change(form.getByLabelText('Division'), { target: { value: '5' } })
    expect(form.getByRole('textbox', { name: 'Team name' })).toBeInTheDocument()
    expect(form.getByText('Nobody listed yet. The team still competes.')).toBeInTheDocument()
    expect(form.queryByRole('combobox', { name: 'Gender' })).not.toBeInTheDocument()
  })

  it('sends a team with its members, blank rows dropped', async () => {
    draw({ adding: true, divisions: WITH_TEAMS })
    const form = sheet('Add athlete')
    fireEvent.change(form.getByLabelText('Division'), { target: { value: '5' } })
    fireEvent.change(form.getByRole('textbox', { name: 'Team name' }), { target: { value: 'Java Jams' } })
    press('Add member')
    press('Add member')
    press('Add member')
    fireEvent.change(form.getByRole('textbox', { name: 'Member 1 name' }), { target: { value: ' Sarah ' } })
    fireEvent.change(form.getByRole('combobox', { name: 'Member 1 gender' }), { target: { value: 'female' } })
    fireEvent.change(form.getByRole('textbox', { name: 'Member 2 name' }), { target: { value: 'Megan' } })
    press('Add athlete')
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/api/athletes', {
      slug: 'rugged-rumble', name: 'Java Jams', bibNumber: null, divisionId: 5, gender: null,
      members: [{ name: 'Sarah', gender: 'female' }, { name: 'Megan', gender: null }],
    }))
  })

  // A team nobody has filled in yet is still a competitor.
  it('saves a team with no members', async () => {
    draw({ adding: true, divisions: WITH_TEAMS })
    const form = sheet('Add athlete')
    fireEvent.change(form.getByLabelText('Division'), { target: { value: '5' } })
    fireEvent.change(form.getByRole('textbox', { name: 'Team name' }), { target: { value: 'Empty' } })
    expect(form.getByRole('status')).toHaveTextContent('0 of 2 members listed. You can still save.')
    press('Add athlete')
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/api/athletes', expect.objectContaining({
      name: 'Empty', members: [],
    })))
  })

  it('reorders and removes members', async () => {
    const members = [
      { id: 1, name: 'A', gender: null, order: 0 },
      { id: 2, name: 'B', gender: null, order: 1 },
      { id: 3, name: 'C', gender: null, order: 2 },
    ]
    draw({ athletes: [team({ members })], divisions: WITH_TEAMS })
    openEditor('Java Jams')
    press('Move member 3 up')
    press('Remove member 1')
    press('Save')
    await waitFor(() => expect(apiPut).toHaveBeenCalledWith('/api/athletes/9?slug=rugged-rumble', expect.objectContaining({
      members: [{ name: 'C', gender: null }, { name: 'B', gender: null }],
    })))
  })

  it('lists members under the team and flags a team that does not match its division', () => {
    draw({
      athletes: [team({ members: [{ id: 1, name: 'Sarah', gender: 'female', order: 0 }] })],
      divisions: WITH_TEAMS,
    })
    expect(within(row('Java Jams')).getByText('Sarah')).toBeInTheDocument()
    expect(within(row('Java Jams')).getByText('Check')).toBeInTheDocument()
    expect(within(row('Java Jams')).getByText('1 of 2 members listed. 0 of 1 male.')).toBeInTheDocument()
    expect(screen.getByText('1 entered · 1 to check')).toBeInTheDocument()
  })

  it('flags a team member who is also entered as an individual', () => {
    draw({
      athletes: [...ATHLETES, team({ members: [
        { id: 1, name: 'Ann Adams', gender: 'female', order: 0 },
        { id: 2, name: 'Cy', gender: 'male', order: 1 },
      ] })],
      divisions: WITH_TEAMS,
    })
    expect(within(row('Java Jams')).getByText('Ann Adams is also entered as an individual.')).toBeInTheDocument()
  })

  it('finds a team by searching for someone on it', () => {
    draw({ athletes: [...ATHLETES, team({ members: [{ id: 1, name: 'Sarah Dickenson', gender: null, order: 0 }] })], divisions: WITH_TEAMS })
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'dicken' } })
    expect(row('Java Jams')).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Ann Adams/ })).not.toBeInTheDocument()
  })

  it('keeps an individual\'s gender', async () => {
    draw({ adding: true })
    const form = sheet('Add athlete')
    fireEvent.change(form.getByRole('textbox', { name: 'Name' }), { target: { value: 'Dee' } })
    fireEvent.change(form.getByRole('combobox', { name: 'Gender' }), { target: { value: 'female' } })
    press('Add athlete')
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/api/athletes', expect.objectContaining({
      name: 'Dee', gender: 'female',
    })))
  })
})
