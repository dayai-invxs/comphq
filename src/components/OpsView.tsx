'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type HeatEntry = {
  athleteId: number
  athleteName: string
  bibNumber: string | null
  divisionName: string | null
  lane: number
}

type Heat = {
  heatNumber: number
  isComplete: boolean
  heatTime: string | null
  corralTime: string | null
  walkoutTime: string | null
  entries: HeatEntry[]
}

type WorkoutData = {
  id: number
  number: number
  name: string
  status: string
  heats: Heat[]
}

type OpsData = {
  workouts: WorkoutData[]
  showBib: boolean
}

function fmtTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  draft:     { label: 'Draft',     className: 'bg-gray-700 text-gray-300' },
  active:    { label: 'Active',    className: 'bg-green-800 text-green-300' },
  completed: { label: 'Completed', className: 'bg-blue-900 text-blue-300' },
}

export default function OpsView({ slug }: { slug: string }) {
  const [data, setData] = useState<OpsData | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [showAthletes, setShowAthletes] = useState(true)
  const [search, setSearch] = useState('')
  const pathname = usePathname()

  const parts = pathname.split('/').filter(Boolean)
  const athleteControlHref = parts.length >= 2 ? `/${parts[0]}/athlete-control` : '/athlete-control'

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/ops?slug=${slug}`, { cache: 'no-store' })
      if (res.ok) {
        setData(await res.json())
        setLastUpdated(new Date())
      }
    } catch {}
  }, [])

  useEffect(() => {
    void fetch('/api/logo').then((r) => r.json()).then((d) => setLogoUrl(d.url))
    void fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [fetchData])

  const searchTerm = search.trim().toLowerCase()

  function filterHeats(heats: Heat[]) {
    if (!searchTerm) return heats
    return heats
      .map((heat) => ({
        ...heat,
        entries: heat.entries.filter((e) =>
          e.athleteName.toLowerCase().includes(searchTerm)
        ),
      }))
      .filter((heat) => heat.entries.length > 0)
  }

  const athletesVisible = showAthletes || !!searchTerm

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
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
            <h1 className="text-3xl font-bold text-white">Ops View</h1>
            <p className="text-gray-400 mt-1">All workouts · All heats</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="search"
            placeholder="Search athlete…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm px-3 py-1.5 focus:outline-none focus:border-orange-500 w-48"
          />
          <button
            onClick={() => setShowAthletes((v) => !v)}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
          >
            {showAthletes ? 'Hide athletes' : 'Show athletes'}
          </button>
          <div className="flex items-center gap-4">
            <Link
              href={athleteControlHref}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
            >
              Athlete Control
            </Link>
            <div className="text-right text-xs text-gray-500">
              <div className="flex items-center gap-2 justify-end">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Live
              </div>
              {lastUpdated && <div className="mt-1">Updated {lastUpdated.toLocaleTimeString()}</div>}
            </div>
          </div>
        </div>
      </div>

      {!data && (
        <div className="text-center text-gray-500 py-20 text-lg">Loading...</div>
      )}

      {data?.workouts.length === 0 && (
        <div className="text-center text-gray-500 py-20 text-lg">No workouts found.</div>
      )}

      {data && data.workouts.map((workout) => {
        const statusStyle = STATUS_STYLES[workout.status] ?? { label: workout.status, className: 'bg-gray-700 text-gray-300' }
        const visibleHeats = filterHeats(workout.heats)
        if (searchTerm && visibleHeats.length === 0) return null
        return (
          <section key={workout.id} className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xl font-bold text-white">
                Workout {workout.number}: {workout.name}
              </h2>
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${statusStyle.className}`}>
                {statusStyle.label}
              </span>
            </div>

            {workout.heats.length === 0 ? (
              <p className="text-gray-500 text-sm">No heats assigned.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {visibleHeats.map((heat) => (
                  <div
                    key={heat.heatNumber}
                    className={`rounded-xl overflow-hidden border ${
                      heat.isComplete
                        ? 'border-gray-700 opacity-60'
                        : 'border-transparent bg-gray-900'
                    }`}
                  >
                    <div className={`px-4 py-2.5 ${heat.isComplete ? 'bg-gray-700' : 'bg-gray-800'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold text-base ${heat.isComplete ? 'text-gray-400' : 'text-orange-400'}`}>
                          Heat {heat.heatNumber}
                        </span>
                        {heat.isComplete && (
                          <span className="text-xs bg-green-900 text-green-400 px-2 py-0.5 rounded-full font-medium">Done</span>
                        )}
                      </div>
                      {(() => {
                        const divs = [...new Set(heat.entries.map((e) => e.divisionName).filter(Boolean))]
                        return divs.length > 0
                          ? <p className="text-gray-400 text-xs">{divs.join(' / ')}</p>
                          : null
                      })()}
                      {heat.corralTime && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Corral: <span className="text-yellow-400 font-mono">{fmtTime(heat.corralTime)}</span>
                          {' · '}
                          Walk Out: <span className="text-blue-400 font-mono">{fmtTime(heat.walkoutTime)}</span>
                          {' · '}
                          Start: <span className="text-white font-mono">{fmtTime(heat.heatTime)}</span>
                        </p>
                      )}
                    </div>
                    {athletesVisible && (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-800/50">
                          <tr>
                            <th className="text-left px-3 py-1.5 text-gray-400 font-medium text-xs w-10">Lane</th>
                            <th className="text-left px-3 py-1.5 text-gray-400 font-medium text-xs">Athlete</th>
                            {data.showBib && <th className="text-left px-3 py-1.5 text-gray-400 font-medium text-xs">Bib</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {heat.entries
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
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </main>
  )
}
