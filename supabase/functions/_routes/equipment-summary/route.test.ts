import { describe, it, expect } from 'vitest'
import { drizzleMock as mock, setAuthUser } from '@/test/setup'
import { GET } from './route'

const req = (slug = 'default') => new Request(`http://test/api/equipment-summary?slug=${slug}`)

describe('GET /api/equipment-summary', () => {
  it('rejects unauthenticated', async () => {
    setAuthUser(null)
    expect((await GET(req())).status).toBe(401)
  })

  it('404s when slug is missing', async () => {
    expect((await GET(req(''))).status).toBe(404)
  })

  it('returns no items when the competition has no workouts', async () => {
    mock.queueResults([])
    expect(await (await GET(req())).json()).toEqual({ items: [] })
  })

  it('returns no items when no workout lists equipment', async () => {
    mock.queueResults([{ id: 1, number: 1, name: 'WOD 1' }], [])
    expect(await (await GET(req())).json()).toEqual({ items: [] })
  })

  // The count is the busiest single heat, never the sum across heats — you buy
  // enough barbells for one heat and reuse them.
  it('counts the busiest heat, not the total across heats', async () => {
    mock.queueResults(
      [{ id: 1, number: 1, name: 'WOD 1' }],
      [{ workoutId: 1, item: 'Barbell', divisionId: null, divisionName: null }],
      [
        { workoutId: 1, heatNumber: 1, athleteId: 1, divisionId: 3 },
        { workoutId: 1, heatNumber: 1, athleteId: 2, divisionId: 3 },
        { workoutId: 1, heatNumber: 2, athleteId: 3, divisionId: 3 },
      ],
    )
    const body = await (await GET(req())).json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].maxCount).toBe(2)
  })

  // Likewise across workouts: the rollup takes the max, not the sum.
  it('takes the max across workouts for the same item', async () => {
    mock.queueResults(
      [{ id: 1, number: 1, name: 'WOD 1' }, { id: 2, number: 2, name: 'WOD 2' }],
      [
        { workoutId: 1, item: 'Barbell', divisionId: null, divisionName: null },
        { workoutId: 2, item: 'Barbell', divisionId: null, divisionName: null },
      ],
      [
        { workoutId: 1, heatNumber: 1, athleteId: 1, divisionId: 3 },
        { workoutId: 2, heatNumber: 1, athleteId: 1, divisionId: 3 },
        { workoutId: 2, heatNumber: 1, athleteId: 2, divisionId: 3 },
        { workoutId: 2, heatNumber: 1, athleteId: 3, divisionId: 3 },
      ],
    )
    const body = await (await GET(req())).json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].maxCount).toBe(3)
    expect(body.items[0].breakdown.map((b: { maxCount: number }) => b.maxCount).sort()).toEqual([1, 3])
  })

  // A row with divisionId null means "all divisions", so every athlete in the
  // heat is counted whatever division they are in.
  it('counts every athlete in the heat when the item applies to all divisions', async () => {
    mock.queueResults(
      [{ id: 1, number: 1, name: 'WOD 1' }],
      [{ workoutId: 1, item: 'Barbell', divisionId: null, divisionName: null }],
      [
        { workoutId: 1, heatNumber: 1, athleteId: 1, divisionId: 3 },
        { workoutId: 1, heatNumber: 1, athleteId: 2, divisionId: 4 },
        { workoutId: 1, heatNumber: 1, athleteId: 3, divisionId: null },
      ],
    )
    const body = await (await GET(req())).json()
    expect(body.items[0].maxCount).toBe(3)
    expect(body.items[0].breakdown[0].divisionNames).toEqual([null])
  })

  it('counts only the listed divisions when the item is division-specific', async () => {
    mock.queueResults(
      [{ id: 1, number: 1, name: 'WOD 1' }],
      [{ workoutId: 1, item: 'Barbell', divisionId: 3, divisionName: 'Rx' }],
      [
        { workoutId: 1, heatNumber: 1, athleteId: 1, divisionId: 3 },
        { workoutId: 1, heatNumber: 1, athleteId: 2, divisionId: 4 },
      ],
    )
    const body = await (await GET(req())).json()
    expect(body.items[0].maxCount).toBe(1)
    expect(body.items[0].breakdown[0].divisionNames).toEqual(['Rx'])
  })

  // An athlete with no division never matches a division-specific row, even
  // though a null divisionId on the equipment row means "everyone".
  it('excludes an athlete with no division from a division-specific item', async () => {
    mock.queueResults(
      [{ id: 1, number: 1, name: 'WOD 1' }],
      [{ workoutId: 1, item: 'Barbell', divisionId: 3, divisionName: 'Rx' }],
      [{ workoutId: 1, heatNumber: 1, athleteId: 1, divisionId: null }],
    )
    const body = await (await GET(req())).json()
    expect(body.items[0].maxCount).toBe(0)
  })

  // One all-divisions row wins over any sibling division-specific rows for the
  // same item in the same workout.
  it('lets a single all-divisions row widen the count for that item', async () => {
    mock.queueResults(
      [{ id: 1, number: 1, name: 'WOD 1' }],
      [
        { workoutId: 1, item: 'Barbell', divisionId: 3, divisionName: 'Rx' },
        { workoutId: 1, item: 'Barbell', divisionId: null, divisionName: null },
      ],
      [
        { workoutId: 1, heatNumber: 1, athleteId: 1, divisionId: 3 },
        { workoutId: 1, heatNumber: 1, athleteId: 2, divisionId: 4 },
      ],
    )
    const body = await (await GET(req())).json()
    expect(body.items[0].maxCount).toBe(2)
    expect(body.items[0].breakdown[0].divisionNames).toEqual(['Rx', null])
  })

  it('reports zero for equipment on a workout with no heats drawn', async () => {
    mock.queueResults(
      [{ id: 1, number: 1, name: 'WOD 1' }],
      [{ workoutId: 1, item: 'Barbell', divisionId: null, divisionName: null }],
      [],
    )
    const body = await (await GET(req())).json()
    expect(body.items[0].maxCount).toBe(0)
  })

  it('sorts items by name and carries workout number and name in the breakdown', async () => {
    mock.queueResults(
      [{ id: 1, number: 2, name: 'Cindy' }],
      [
        { workoutId: 1, item: 'Rower', divisionId: null, divisionName: null },
        { workoutId: 1, item: 'Barbell', divisionId: null, divisionName: null },
      ],
      [{ workoutId: 1, heatNumber: 1, athleteId: 1, divisionId: 3 }],
    )
    const body = await (await GET(req())).json()
    expect(body.items.map((i: { item: string }) => i.item)).toEqual(['Barbell', 'Rower'])
    expect(body.items[0].breakdown[0]).toMatchObject({ workoutId: 1, workoutNumber: 2, workoutName: 'Cindy' })
  })

  // Group keys are `workoutId::item`, so an item name containing '::' has to be
  // rejoined rather than truncated at the first separator.
  it('keeps an item name that contains a double colon intact', async () => {
    mock.queueResults(
      [{ id: 1, number: 1, name: 'WOD 1' }],
      [{ workoutId: 1, item: 'Plate::25kg', divisionId: null, divisionName: null }],
      [{ workoutId: 1, heatNumber: 1, athleteId: 1, divisionId: 3 }],
    )
    const body = await (await GET(req())).json()
    expect(body.items[0].item).toBe('Plate::25kg')
  })

  // Heat keys are matched with a `${workoutId}-` prefix, so workout 1 must not
  // pick up heats from workout 12.
  it('does not let workout 1 absorb heats from workout 12', async () => {
    mock.queueResults(
      [{ id: 1, number: 1, name: 'WOD 1' }, { id: 12, number: 12, name: 'WOD 12' }],
      [{ workoutId: 1, item: 'Barbell', divisionId: null, divisionName: null }],
      [
        { workoutId: 1, heatNumber: 1, athleteId: 1, divisionId: 3 },
        { workoutId: 12, heatNumber: 1, athleteId: 2, divisionId: 3 },
        { workoutId: 12, heatNumber: 1, athleteId: 3, divisionId: 3 },
      ],
    )
    const body = await (await GET(req())).json()
    expect(body.items[0].maxCount).toBe(1)
  })
})
