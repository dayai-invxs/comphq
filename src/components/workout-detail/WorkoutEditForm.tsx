'use client'

import { useState } from 'react'
import type { Workout } from '@/hooks/useWorkoutDetail'
import { SCORE_TYPE_OPTIONS } from '@/lib/workoutEnums'
import { toIsoOrNull } from '@/lib/datetime'

type WorkoutLocation = { id: number; name: string }

type TimeField = string

function secsToField(secs: number): string {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
}

function fieldToSecs(val: string): number {
  const [m = '0', s = '0'] = val.split(':')
  return (parseInt(m) || 0) * 60 + (parseInt(s) || 0)
}

function toLocalDatetime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso), pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input
        type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder="0:00"
        className="w-24 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
      />
    </div>
  )
}

function Toggle({ on, onToggle, title, subtitle }: { on: boolean; onToggle: () => void; title: string; subtitle: string }) {
  return (
    <div className="col-span-2">
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <div onClick={onToggle} className={`relative w-10 h-6 rounded-full transition-colors ${on ? 'bg-orange-500' : 'bg-gray-700'}`}>
          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${on ? 'translate-x-5' : 'translate-x-1'}`} />
        </div>
        <div>
          <span className="text-sm text-white font-medium">{title}</span>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </label>
    </div>
  )
}

type Props = {
  workout: Workout
  loading: boolean
  locations: WorkoutLocation[]
  onSave: (patch: Record<string, unknown>) => Promise<boolean>
  onCancel: () => void
}

export default function WorkoutEditForm({ workout, loading, locations, onSave, onCancel }: Props) {
  const [name, setName] = useState(workout.name)
  const [number, setNumber] = useState(String(workout.number))
  const [scoreType, setScoreType] = useState(workout.scoreType)
  const [lanes, setLanes] = useState(String(workout.lanes))
  const [heatInterval, setHeatInterval] = useState<TimeField>(secsToField(workout.heatIntervalSecs))
  const [timeBetweenHeats, setTimeBetweenHeats] = useState<TimeField>(secsToField(workout.timeBetweenHeatsSecs))
  const [callTime, setCallTime] = useState<TimeField>(secsToField(workout.callTimeSecs))
  const [walkoutTime, setWalkoutTime] = useState<TimeField>(secsToField(workout.walkoutTimeSecs))
  const [startTime, setStartTime] = useState(toLocalDatetime(workout.startTime))
  const [mixedHeats, setMixedHeats] = useState(workout.mixedHeats)
  const [tiebreakEnabled, setTiebreakEnabled] = useState(workout.tiebreakEnabled)
  const [tiebreakScoreType, setTiebreakScoreType] = useState(workout.tiebreakScoreType ?? 'time')
  const [partBEnabled, setPartBEnabled] = useState(workout.partBEnabled)
  const [partBScoreType, setPartBScoreType] = useState(workout.partBScoreType)
  const [halfWeight, setHalfWeight] = useState(workout.halfWeight)
  const [locationId, setLocationId] = useState(workout.locationId ? String(workout.locationId) : '')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const ok = await onSave({
      name: name.trim(), number: Number(number), scoreType, lanes: Number(lanes),
      heatIntervalSecs: fieldToSecs(heatInterval), timeBetweenHeatsSecs: fieldToSecs(timeBetweenHeats),
      callTimeSecs: fieldToSecs(callTime), walkoutTimeSecs: fieldToSecs(walkoutTime),
      startTime: toIsoOrNull(startTime), mixedHeats, tiebreakEnabled, tiebreakScoreType,
      partBEnabled, partBScoreType, halfWeight,
      locationId: locationId ? Number(locationId) : null,
    })
    if (ok) onCancel()
  }

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-orange-500/30">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-white">Edit Settings</h2>
        <button onClick={onCancel} className="text-gray-400 hover:text-white text-sm transition-colors">Cancel</button>
      </div>
      <form onSubmit={submit} className="grid grid-cols-2 gap-4">
        <div><label className="block text-xs text-gray-400 mb-1">Workout #</label><input type="number" value={number} onChange={(e) => setNumber(e.target.value)} className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" required /></div>
        <div><label className="block text-xs text-gray-400 mb-1">Name</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" required /></div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Score Type</label>
          <select value={scoreType} onChange={(e) => setScoreType(e.target.value)} className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
            {SCORE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {locations.length > 0 && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">Location</label>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
              <option value="">No location</option>
              {locations.map((l) => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
            </select>
          </div>
        )}
        <div><label className="block text-xs text-gray-400 mb-1">Lanes</label><input type="number" value={lanes} onChange={(e) => setLanes(e.target.value)} className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" required /></div>
        <TimeInput label="Heat Interval" value={heatInterval} onChange={setHeatInterval} />
        <TimeInput label="Time Between Heats" value={timeBetweenHeats} onChange={setTimeBetweenHeats} />
        <TimeInput label="Corral Call (before heat)" value={callTime} onChange={setCallTime} />
        <TimeInput label="Walk Out (before heat)" value={walkoutTime} onChange={setWalkoutTime} />
        <div><label className="block text-xs text-gray-400 mb-1">Start Time</label><input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" /></div>
        <Toggle on={mixedHeats} onToggle={() => setMixedHeats((v) => !v)} title="Mixed Heats" subtitle={mixedHeats ? 'Athletes from different divisions can share a heat' : 'Each heat contains only one division'} />
        <Toggle on={tiebreakEnabled} onToggle={() => setTiebreakEnabled((v) => !v)} title="Tie Break Score" subtitle="Enter a tiebreak score per athlete to break ties" />
        {tiebreakEnabled && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">Tie Break Score Type</label>
            <select value={tiebreakScoreType} onChange={(e) => setTiebreakScoreType(e.target.value)} className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
              {SCORE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}
        <Toggle on={partBEnabled} onToggle={() => setPartBEnabled((v) => !v)} title="Part A / Part B" subtitle="Add a second score (Part B) to each athlete" />
        {partBEnabled && (
          <div className="col-span-2">
            <label className="block text-xs text-gray-400 mb-1">Part B Score Type</label>
            <select value={partBScoreType} onChange={(e) => setPartBScoreType(e.target.value)} className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
              {SCORE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}
        <Toggle on={halfWeight} onToggle={() => setHalfWeight((v) => !v)} title="Half Weight" subtitle="This workout counts at 50% on the overall leaderboard" />
        <div className="col-span-2 flex gap-3">
          <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors">{loading ? 'Saving...' : 'Save Changes'}</button>
          <button type="button" onClick={onCancel} className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-6 py-2.5 text-sm transition-colors">Cancel</button>
        </div>
      </form>
    </div>
  )
}
