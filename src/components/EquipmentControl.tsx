'use client'

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

type HeatEntry = { athleteId: number; lane: number; divisionName: string | null }
type Heat = { heatNumber: number; isComplete: boolean; entries: HeatEntry[] }
type WorkoutData = { id: number; number: number; name: string; status: string; heats: Heat[] }
type EquipmentItem = { id: number; item: string; divisionId: number | null; division: { id: number; name: string } | null }

type Props = { workouts: WorkoutData[]; slug: string; checks: Record<string, boolean>; setChecks: Dispatch<SetStateAction<Record<string, boolean>>> }

export default function EquipmentControl({ workouts, slug, checks, setChecks }: Props) {
  const [expandedHeats, setExpandedHeats] = useState<Set<string>>(new Set())
  const [equipmentByWorkout, setEquipmentByWorkout] = useState<Record<number, EquipmentItem[]>>({})

  // Fetch equipment for all workouts in parallel once workouts are loaded
  useEffect(() => {
    if (workouts.length === 0) return
    void Promise.all(
      workouts.map((w) =>
        fetch(`/api/workouts/${w.id}/equipment?slug=${slug}`)
          .then((r) => r.ok ? r.json() : [])
          .then((items: EquipmentItem[]) => ({ id: w.id, items }))
      )
    ).then((results) => {
      const map: Record<number, EquipmentItem[]> = {}
      for (const { id, items } of results) map[id] = items
      setEquipmentByWorkout(map)
    })
  }, [workouts, slug])

  function toggleExpand(workoutId: number, heatNumber: number) {
    const key = `${workoutId}-${heatNumber}`
    setExpandedHeats((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function checkKey(workoutId: number, heatNumber: number, divisionName: string | null) {
    return `${workoutId}-${heatNumber}-${divisionName ?? '__none__'}`
  }

  function isChecked(workoutId: number, heatNumber: number, divisionName: string | null) {
    return checks[checkKey(workoutId, heatNumber, divisionName)] ?? false
  }

  function toggleCheck(workoutId: number, heatNumber: number, divisionName: string | null) {
    const key = checkKey(workoutId, heatNumber, divisionName)
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <>
      {workouts.length === 0 && (
        <div className="text-center text-gray-500 py-20 text-lg">Loading...</div>
      )}

      {workouts.map((workout) => {
        const activeHeats = workout.heats.filter((h) => !h.isComplete)
        if (activeHeats.length === 0 && workout.heats.length > 0) return null

        return (
          <section key={workout.id} className="mb-10">
            <h2 className="text-xl font-bold text-white mb-3">
              Workout {workout.number}: {workout.name}
            </h2>

            {workout.heats.length === 0 ? (
              <p className="text-gray-500 text-sm">No heats assigned.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="w-8 px-2 py-2" />
                    <th className="text-left px-3 py-2 text-gray-400 font-medium w-20">Heat</th>
                    <th className="text-left px-3 py-2 text-gray-400 font-medium">Equipment set per division</th>
                  </tr>
                </thead>
                <tbody>
                  {workout.heats.map((heat) => {
                    const sortedEntries = [...heat.entries].sort((a, b) => a.lane - b.lane)
                    const divisionNames = [...new Set(sortedEntries.map((e) => e.divisionName))]
                    const allChecked = divisionNames.length > 0 &&
                      divisionNames.every((d) => isChecked(workout.id, heat.heatNumber, d))
                    const expanded = expandedHeats.has(`${workout.id}-${heat.heatNumber}`)
                    const workoutEquipment = equipmentByWorkout[workout.id] ?? []

                    return (
                      <>
                        <tr
                          key={heat.heatNumber}
                          className={`border-b border-gray-800 transition-opacity ${allChecked ? 'opacity-40' : ''}`}
                        >
                          <td className="px-2 py-3">
                            {sortedEntries.length > 0 && (
                              <button
                                onClick={() => toggleExpand(workout.id, heat.heatNumber)}
                                className="text-gray-400 hover:text-white transition-colors"
                                aria-label={expanded ? 'Collapse' : 'Expand'}
                              >
                                <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            )}
                          </td>
                          <td className={`px-3 py-3 font-semibold ${allChecked ? 'text-gray-500' : 'text-orange-400'}`}>
                            {heat.heatNumber}
                            {heat.isComplete && <span className="ml-1.5 text-xs text-green-500">✓</span>}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-3">
                              {divisionNames.length === 0 && (
                                <span className="text-gray-600 text-xs">No athletes assigned</span>
                              )}
                              {divisionNames.map((divName) => {
                                const checked = isChecked(workout.id, heat.heatNumber, divName)
                                return (
                                  <label key={divName ?? '__none__'} className="flex items-center gap-1.5 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleCheck(workout.id, heat.heatNumber, divName)}
                                      className="w-3.5 h-3.5 accent-orange-500"
                                    />
                                    <span className={`text-sm ${checked ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
                                      {divName ?? 'No Division'}
                                    </span>
                                  </label>
                                )
                              })}
                            </div>
                          </td>
                        </tr>

                        {expanded && sortedEntries.length > 0 && (
                          <tr key={`${heat.heatNumber}-detail`} className="border-b border-gray-800 bg-gray-900/50">
                            <td />
                            <td colSpan={2} className="px-3 py-3 space-y-4">

                              {/* Equipment per division */}
                              {divisionNames.length > 0 && (
                                <div className="space-y-3">
                                  {divisionNames.map((divName) => {
                                    // Items for this specific division + items for "all divisions" (null)
                                    const divId = divName == null ? null
                                      : workoutEquipment.find((e) => e.division?.name === divName)?.divisionId ?? null
                                    const items = workoutEquipment.filter(
                                      (e) => e.divisionId === null || e.division?.name === divName
                                    )
                                    if (items.length === 0) return (
                                      <div key={divName ?? '__none__'}>
                                        <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide mb-1">
                                          {divName ?? 'No Division'}
                                        </p>
                                        <p className="text-xs text-gray-600">No equipment listed</p>
                                      </div>
                                    )
                                    return (
                                      <div key={divName ?? '__none__'}>
                                        <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide mb-1">
                                          {divName ?? 'No Division'}
                                        </p>
                                        <ul className="space-y-0.5">
                                          {items.map((eq) => (
                                            <li key={eq.id} className="text-sm text-gray-300 flex items-center gap-1.5">
                                              <span className="text-gray-600">·</span>
                                              {eq.item}
                                              {eq.divisionId === null && divisionNames.length > 1 && (
                                                <span className="text-xs text-gray-600">(all)</span>
                                              )}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}

                              {/* Lane assignments */}
                              <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Lane Assignments</p>
                                <div className="flex flex-col gap-y-1">
                                  {sortedEntries.map((e) => (
                                    <span key={e.athleteId} className="text-sm text-gray-300">
                                      <span className="text-orange-400 font-bold mr-1.5">Lane {e.lane}</span>
                                      <span className="text-gray-400">{e.divisionName ?? 'No Division'}</span>
                                    </span>
                                  ))}
                                </div>
                              </div>

                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            )}
          </section>
        )
      })}
    </>
  )
}
