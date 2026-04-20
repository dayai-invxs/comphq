import { prisma } from '@/lib/prisma'
import { calcHeatStartMs } from '@/lib/heatTime'

export async function GET() {
  const showBibSetting = await prisma.setting.findUnique({ where: { key: 'showBib' } })
  const showBib = showBibSetting?.value !== 'false'

  const workouts = await prisma.workout.findMany({
    where: { status: 'active' },
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

    const schedule = workout.assignments
      .filter((a) => !completedHeats.includes(a.heatNumber))
      .map((a) => {
        const heatStartMs = calcHeatStartMs(a.heatNumber, workout.startTime, workout.heatIntervalSecs, workout.heatStartOverrides, workout.timeBetweenHeatsSecs)
        return {
          athleteId: a.athleteId,
          athleteName: a.athlete.name,
          bibNumber: a.athlete.bibNumber,
          divisionName: a.athlete.division?.name ?? null,
          heatNumber: a.heatNumber,
          lane: a.lane,
          heatTime: heatStartMs != null ? new Date(heatStartMs).toISOString() : null,
          corralTime: heatStartMs != null ? new Date(heatStartMs - workout.callTimeSecs * 1000).toISOString() : null,
          walkoutTime: heatStartMs != null ? new Date(heatStartMs - workout.walkoutTimeSecs * 1000).toISOString() : null,
        }
      })

    return {
      id: workout.id,
      number: workout.number,
      name: workout.name,
      schedule,
    }
  })

  return Response.json({ workouts: result, showBib })
}
