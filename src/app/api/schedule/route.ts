import { prisma } from '@/lib/prisma'
import { calcHeatStartMs } from '@/lib/heatTime'
import fs from 'fs'
import path from 'path'

const SETTINGS_PATH = path.join(process.cwd(), 'data', 'settings.json')
function readSettings(): Record<string, unknown> {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) } catch { return {} }
}

export async function GET() {
  const settings = readSettings()
  const showBib = settings.showBib !== false

  const workout = await prisma.workout.findFirst({
    where: { status: 'active' },
    include: {
      assignments: {
        include: { athlete: { include: { division: true } } },
        orderBy: [{ heatNumber: 'asc' }, { lane: 'asc' }],
      },
    },
  })

  if (!workout) {
    return Response.json({ workout: null, schedule: [], showBib })
  }

  const completedHeats: number[] = JSON.parse(workout.completedHeats || '[]')

  const schedule = workout.assignments
    .filter((a) => !completedHeats.includes(a.heatNumber))
    .map((a) => {
      const heatStartMs = calcHeatStartMs(a.heatNumber, workout.startTime, workout.heatIntervalSecs, workout.heatStartOverrides)
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

  return Response.json({
    workout: { id: workout.id, number: workout.number, name: workout.name },
    schedule,
    showBib,
  })
}
