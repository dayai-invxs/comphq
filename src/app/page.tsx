'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'

type ScheduleEntry = {
  athleteId: number
  athleteName: string
  bibNumber: string | null
  divisionName: string | null
  heatNumber: number
  lane: number
  heatTime: string | null
  corralTime: string | null
  walkoutTime: string | null
}

type ScheduleData = {
  workout: { id: number; number: number; name: string } | null
  schedule: ScheduleEntry[]
  showBib: boolean
}

function fmtTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function PublicSchedule() {
  const [data, setData] = useState<ScheduleData | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  const fetchSchedule = useCallback(async () => {
    try {
      const res = await fetch('/api/schedule', { cache: 'no-store' })
      if (res.ok) {
        setData(await res.json())
        setLastUpdated(new Date())
      }
    } catch {}
  }, [])

  useEffect(() => {
    fetch('/api/logo').then((r) => r.json()).then((d) => setLogoUrl(d.url))
    fetchSchedule()
    const interval = setInterval(fetchSchedule, 10000)
    return () => clearInterval(interval)
  }, [fetchSchedule])

  const byHeat = data?.schedule.reduce<Record<number, ScheduleEntry[]>>((acc, e) => {
    ;(acc[e.heatNumber] ??= []).push(e)
    return acc
  }, {})

  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-5">
          {logoUrl && (
            <Image
              src={logoUrl}
              alt="Competition logo"
              width={120}
              height={60}
              className="max-h-14 w-auto object-contain"
              unoptimized
            />
          )}
          <div>
            <h1 className="text-3xl font-bold text-white">Competition Schedule</h1>
            {data?.workout && (
              <p className="text-gray-400 mt-1">
                Workout {data.workout.number}: {data.workout.name}
              </p>
            )}
          </div>
        </div>
        <div className="text-right text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Live
          </div>
          {lastUpdated && (
            <div className="mt-1">Updated {lastUpdated.toLocaleTimeString()}</div>
          )}
        </div>
      </div>

      {!data && (
        <div className="text-center text-gray-500 py-20 text-lg">Loading schedule...</div>
      )}

      {data && !data.workout && (
        <div className="text-center text-gray-500 py-20 text-lg">
          No active workout at this time.
        </div>
      )}

      {data?.workout && byHeat && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Object.entries(byHeat)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([heatNum, entries]) => (
              <div key={heatNum} className="bg-gray-900 rounded-xl overflow-hidden">
                <div className="bg-gray-800 px-4 py-2.5">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-base font-semibold text-orange-400">Heat {heatNum}</h2>
                    {(() => {
                      const divs = [...new Set(entries.map((e) => e.divisionName).filter(Boolean))]
                      return divs.length > 0 ? <span className="text-gray-400 text-xs truncate">{divs.join(' / ')}</span> : null
                    })()}
                  </div>
                  {entries[0]?.corralTime && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Corral: <span className="text-yellow-400 font-mono">{fmtTime(entries[0].corralTime)}</span>
                      {' · '}
                      Walk Out: <span className="text-blue-400 font-mono">{fmtTime(entries[0].walkoutTime)}</span>
                      {' · '}
                      Start: <span className="text-white font-mono">{fmtTime(entries[0].heatTime)}</span>
                    </p>
                  )}
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-800/50">
                    <tr>
                      <th className="text-left px-3 py-1.5 text-gray-400 font-medium text-xs w-10">Lane</th>
                      <th className="text-left px-3 py-1.5 text-gray-400 font-medium text-xs">Athlete</th>
                      {data.showBib && <th className="text-left px-3 py-1.5 text-gray-400 font-medium text-xs">Bib</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {entries
                      .sort((a, b) => a.lane - b.lane)
                      .map((e) => (
                        <tr key={e.athleteId} className="border-t border-gray-800">
                          <td className="px-3 py-2 font-bold text-orange-400">{e.lane}</td>
                          <td className="px-3 py-2 font-medium text-white">{e.athleteName}</td>
                          {data.showBib && <td className="px-3 py-2 text-gray-400 text-xs">{e.bibNumber ?? '—'}</td>}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ))}
        </div>
      )}
    </main>
  )
}
