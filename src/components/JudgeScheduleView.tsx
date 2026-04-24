'use client'

import { useEffect, useState } from 'react'
import { SlugNav } from '@/components/SlugNav'
import { getJson } from '@/lib/http'

type JudgeAssignment = { judgeId: number; judgeName: string; lane: number }
type Heat = { heatNumber: number; heatTimeMs: number | null; walkoutTimeMs: number | null; assignments: JudgeAssignment[] }

function fmtTime(ms: number | null): string {
  if (ms == null) return '—'
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
type WorkoutData = { id: number; number: number; name: string; locationName: string | null; heats: Heat[] }
type Judge = { id: number; name: string }
type ScheduleData = { judges: Judge[]; workouts: WorkoutData[] }

export default function JudgeScheduleView({ slug }: { slug: string }) {
  const [data, setData] = useState<ScheduleData | null>(null)
  const [filter, setFilter] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getJson<ScheduleData>(`/api/judge-schedule?slug=${slug}`)
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [slug])

  const search = filter.trim().toLowerCase()
  const filtered = search
    ? data?.workouts.map(wk => ({
        ...wk,
        heats: wk.heats
          .map(h => ({ ...h, assignments: h.assignments.filter(a => a.judgeName.toLowerCase().includes(search)) }))
          .filter(h => h.assignments.length > 0),
      })).filter(wk => wk.heats.length > 0)
    : data?.workouts

  return (
    <div className="min-h-screen flex flex-col">
      <SlugNav slug={slug} />
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white">Judge Schedule</h1>
            {data && (
              <p className="text-gray-400 mt-1">{data.judges.length} judge{data.judges.length !== 1 ? 's' : ''}</p>
            )}
          </div>
          {data && data.judges.length > 0 && (
            <input
              type="search"
              placeholder="Search judge…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm px-3 py-1.5 focus:outline-none focus:border-orange-500 w-48"
            />
          )}
        </div>

        {error && <div className="text-red-400 py-10 text-center">{error}</div>}
        {!data && !error && <div className="text-center text-gray-500 py-20 text-lg">Loading…</div>}

        {data && data.judges.length === 0 && (
          <div className="text-center text-gray-500 py-20 text-lg">
            No judges found. Add volunteers with a &ldquo;Judge&rdquo; role in the admin panel.
          </div>
        )}

        {data && data.judges.length > 0 && (!filtered || filtered.length === 0) && (
          <div className="text-center text-gray-500 py-20 text-lg">No assignments yet.</div>
        )}

        {filtered && filtered.length > 0 && (
          <div className="space-y-8">
            {filtered.map(wk => (
              <div key={wk.id}>
                <h2 className="text-xl font-bold text-white mb-4">
                  Workout {wk.number}: {wk.name}
                  {wk.locationName && <span className="ml-2 text-sm font-normal text-gray-400">· {wk.locationName}</span>}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {wk.heats.map(heat => (
                    <div key={heat.heatNumber} className="bg-gray-900 rounded-xl overflow-hidden">
                      <div className="bg-gray-800 px-4 py-2.5">
                        <h3 className="text-base font-semibold text-orange-400">Heat {heat.heatNumber}</h3>
                        {heat.walkoutTimeMs != null && (
                          <p className="text-xs text-gray-400 mt-0.5">Walk out: <span className="text-white font-mono">{fmtTime(heat.walkoutTimeMs)}</span></p>
                        )}
                      </div>
                      <table className="w-full text-sm">
                        <thead className="bg-gray-800/50">
                          <tr>
                            <th className="text-left px-3 py-1.5 text-gray-400 font-medium text-xs w-12">Lane</th>
                            <th className="text-left px-3 py-1.5 text-gray-400 font-medium text-xs">Judge</th>
                          </tr>
                        </thead>
                        <tbody>
                          {heat.assignments.map(a => (
                            <tr key={a.lane} className="border-t border-gray-800">
                              <td className="px-3 py-2 font-bold text-orange-400">{a.lane}</td>
                              <td className="px-3 py-2 font-medium text-white">{a.judgeName}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
