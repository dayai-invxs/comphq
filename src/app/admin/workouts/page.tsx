'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Workout = {
  id: number
  number: number
  name: string
  scoreType: string
  lanes: number
  status: string
}

const statusColor: Record<string, string> = {
  draft: 'bg-gray-700 text-gray-300',
  active: 'bg-green-900 text-green-300',
  completed: 'bg-blue-900 text-blue-300',
}

const SCORE_TYPE_LABELS: Record<string, string> = {
  time: 'Time',
  rounds_reps: 'Rounds + Reps',
  weight: 'Weight',
}

function mmssToSecs(mins: string, secs: string) {
  return Number(mins) * 60 + Number(secs)
}

type TimeField = { mins: string; secs: string }

export default function WorkoutsPage() {
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const [scoreType, setScoreType] = useState('time')
  const [lanes, setLanes] = useState('5')
  const [heatInterval, setHeatInterval] = useState<TimeField>({ mins: '10', secs: '0' })
  const [timeBetweenHeats, setTimeBetweenHeats] = useState<TimeField>({ mins: '2', secs: '0' })
  const [callTime, setCallTime] = useState<TimeField>({ mins: '10', secs: '0' })
  const [walkoutTime, setWalkoutTime] = useState<TimeField>({ mins: '2', secs: '0' })
  const [startTime, setStartTime] = useState('')
  const [mixedHeats, setMixedHeats] = useState(true)
  const [tiebreakEnabled, setTiebreakEnabled] = useState(false)
  const [loading, setLoading] = useState(false)

  async function load() {
    const res = await fetch('/api/workouts')
    setWorkouts(await res.json())
  }

  useEffect(() => { load() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await fetch('/api/workouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: Number(number),
        name: name.trim(),
        scoreType,
        lanes: Number(lanes),
        heatIntervalSecs: mmssToSecs(heatInterval.mins, heatInterval.secs),
        timeBetweenHeatsSecs: mmssToSecs(timeBetweenHeats.mins, timeBetweenHeats.secs),
        callTimeSecs: mmssToSecs(callTime.mins, callTime.secs),
        walkoutTimeSecs: mmssToSecs(walkoutTime.mins, walkoutTime.secs),
        startTime: startTime || null,
        mixedHeats,
        tiebreakEnabled,
      }),
    })
    setNumber('')
    setName('')
    setScoreType('time')
    setLanes('5')
    setHeatInterval({ mins: '10', secs: '0' })
    setTimeBetweenHeats({ mins: '2', secs: '0' })
    setCallTime({ mins: '10', secs: '0' })
    setWalkoutTime({ mins: '2', secs: '0' })
    setStartTime('')
    setMixedHeats(true)
    setTiebreakEnabled(false)
    await load()
    setLoading(false)
  }

  function TimeInput({ label, value, onChange }: { label: string; value: TimeField; onChange: (v: TimeField) => void }) {
    return (
      <div>
        <label className="block text-xs text-gray-400 mb-1">{label}</label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min="0"
            value={value.mins}
            onChange={(e) => onChange({ ...value, mins: e.target.value })}
            className="w-16 bg-gray-800 text-white rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="0"
          />
          <span className="text-gray-500 text-sm font-mono">m</span>
          <input
            type="number"
            min="0"
            max="59"
            value={value.secs}
            onChange={(e) => onChange({ ...value, secs: e.target.value })}
            className="w-16 bg-gray-800 text-white rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="0"
          />
          <span className="text-gray-500 text-sm font-mono">s</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-white">Workouts</h1>

      <div className="bg-gray-900 rounded-xl p-6 max-w-2xl">
        <h2 className="text-lg font-semibold text-white mb-4">Add Workout</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Workout #</label>
            <input
              type="number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Score Type</label>
            <select
              value={scoreType}
              onChange={(e) => setScoreType(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="time">Time (lower is better)</option>
              <option value="rounds_reps">Rounds + Reps (higher is better)</option>
              <option value="weight">Weight (higher is better)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Lanes</label>
            <input
              type="number"
              value={lanes}
              onChange={(e) => setLanes(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              required
            />
          </div>
          <TimeInput label="Heat Interval" value={heatInterval} onChange={setHeatInterval} />
          <TimeInput label="Time Between Heats" value={timeBetweenHeats} onChange={setTimeBetweenHeats} />
          <TimeInput label="Corral Call (before heat)" value={callTime} onChange={setCallTime} />
          <TimeInput label="Walk Out (before heat)" value={walkoutTime} onChange={setWalkoutTime} />
          <div>
            <label className="block text-xs text-gray-400 mb-1">Start Time (optional)</label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div className="col-span-2">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() => setMixedHeats((v) => !v)}
                className={`relative w-10 h-6 rounded-full transition-colors ${mixedHeats ? 'bg-orange-500' : 'bg-gray-700'}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${mixedHeats ? 'translate-x-5' : 'translate-x-1'}`} />
              </div>
              <div>
                <span className="text-sm text-white font-medium">Mixed Heats</span>
                <p className="text-xs text-gray-500">
                  {mixedHeats ? 'Athletes from different divisions can share a heat' : 'Each heat contains only one division'}
                </p>
              </div>
            </label>
          </div>
          {scoreType === 'rounds_reps' && (
            <div className="col-span-2">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div
                  onClick={() => setTiebreakEnabled((v) => !v)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${tiebreakEnabled ? 'bg-orange-500' : 'bg-gray-700'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${tiebreakEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
                </div>
                <div>
                  <span className="text-sm text-white font-medium">Tie Break Time</span>
                  <p className="text-xs text-gray-500">Enter a tiebreak time per athlete — lowest time wins ties</p>
                </div>
              </label>
            </div>
          )}
          <div className="col-span-2">
            <button
              type="submit"
              disabled={loading || !number || !name}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors"
            >
              {loading ? 'Creating...' : 'Create Workout'}
            </button>
          </div>
        </form>
      </div>

      {workouts.length > 0 && (
        <div className="space-y-2">
          {workouts.map((w) => (
            <Link
              key={w.id}
              href={`/admin/workouts/${w.id}`}
              className="flex items-center justify-between bg-gray-900 hover:bg-gray-800 rounded-xl px-5 py-4 transition-colors"
            >
              <div>
                <span className="font-semibold text-white">WOD {w.number}: {w.name}</span>
                <span className="text-gray-400 text-sm ml-3">
                  {w.lanes} lanes · {SCORE_TYPE_LABELS[w.scoreType] ?? w.scoreType}
                </span>
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusColor[w.status] ?? 'bg-gray-700 text-gray-300'}`}>
                {w.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
