import { prisma } from '@/lib/prisma'
import { calcHeatStartMs } from '@/lib/heatTime'

export async function GET() {
  const showBibSetting = await prisma.setting.findUnique({ where: { key: 'showBib' } })
  const showBib = showBibSetting?.value !== 'false'

  const workouts = await prisma.workout.findMany({
    orderBy: { number: 'asc' },
    include: {
      assignments: {
        include: { athlete: { include: { division: true } } },
        orderBy: [{ heatNumber: 'asc' }, { lane: 'asc' }],
      },
    },
  })

  const result = workouts.map((workout) => {
    const completedHeats: number[] = JSON.parse(workout.completedHeats || '[]')
    const heatNums = [...new Set(workout.assignments.map((a) => a.heatNumber))].sort((a, b) => a - b)

    const heats = heatNums.map((heatNumber) => {
      const heatStartMs = calcHeatStartMs(heatNumber, workout.startTime, workout.heatIntervalSecs, workout.heatStartOverrides, workout.timeBetweenHeatsSecs)
      const entries = workout.assignments
        .filter((a) => a.heatNumber === heatNumber)
        .map((a) => ({
          athleteId: a.athleteId,
          athleteName: a.athlete.name,
          bibNumber: a.athlete.bibNumber,
          divisionName: a.athlete.division?.name ?? null,
          lane: a.lane,
        }))

      return {
        heatNumber,
        isComplete: completedHeats.includes(heatNumber),
        heatTime: heatStartMs != null ? new Date(heatStartMs).toISOString() : null,
        corralTime: heatStartMs != null ? new Date(heatStartMs - workout.callTimeSecs * 1000).toISOString() : null,
        walkoutTime: heatStartMs != null ? new Date(heatStartMs - workout.walkoutTimeSecs * 1000).toISOString() : null,
        entries,
      }
    })

    return {
      id: workout.id,
      number: workout.number,
      name: workout.name,
      status: workout.status,
      heats,
    }
  })

  return Response.json({ workouts: result, showBib })
}
