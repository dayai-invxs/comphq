'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { statusStyle } from '@/lib/workoutEnums'

type Workout = { id: number; number: number; name: string; status: string; lanes: number }

export default function CompetitionDashboard() {
  const { slug } = useParams<{ slug: string }>()
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [athleteCount, setAthleteCount] = useState(0)

  useEffect(() => {
    fetch(`/api/workouts?slug=${slug}`).then((r) => r.json()).then(setWorkouts)
    fetch(`/api/athletes?slug=${slug}`).then((r) => r.json()).then((a) => setAthleteCount(a.length))
  }, [slug])

  const base = `/${slug}/admin`

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">Competition overview</p>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-sm">
        <div className="bg-gray-900 rounded-xl p-4">
          <div className="text-3xl font-bold text-orange-400">{athleteCount}</div>
          <div className="text-sm text-gray-400 mt-1">Athletes</div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4">
          <div className="text-3xl font-bold text-orange-400">{workouts.length}</div>
          <div className="text-sm text-gray-400 mt-1">Workouts</div>
        </div>
      </div>

      {workouts.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Workouts</h2>
          <div className="space-y-2 max-w-2xl">
            {workouts.map((w) => (
              <Link
                key={w.id}
                href={`${base}/workouts/${w.id}`}
                className="flex items-center justify-between bg-gray-900 hover:bg-gray-800 rounded-xl px-5 py-4 transition-colors"
              >
                <div>
                  <span className="font-semibold text-white">WOD {w.number}: {w.name}</span>
                  <span className="text-gray-400 text-sm ml-3">{w.lanes} lanes</span>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusStyle(w.status).className}`}>
                  {statusStyle(w.status).label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-4 flex-wrap">
        <Link href={`${base}/people`} className="bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg px-5 py-2.5 text-sm transition-colors">
          Manage Athletes
        </Link>
        <Link href={`${base}/workouts`} className="bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg px-5 py-2.5 text-sm transition-colors">
          Manage Workouts
        </Link>
        <a
          href={`/api/export?slug=${slug}`}
          download
          className="bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg px-5 py-2.5 text-sm transition-colors"
        >
          Export (CSV)
        </a>
        <a
          href={`/api/export/zip?slug=${slug}`}
          download
          className="bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg px-5 py-2.5 text-sm transition-colors"
          title="Per-table CSVs + JSON manifest, zipped"
        >
          Export (ZIP)
        </a>
      </div>
    </div>
  )
}
