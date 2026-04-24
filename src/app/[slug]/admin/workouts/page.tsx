'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { scoreTypeLabel, statusStyle } from '@/lib/workoutEnums'
import { getJson, postJson, patchJson } from '@/lib/http'
import { toIsoOrNull } from '@/lib/datetime'

type Workout = { id: number; number: number; name: string; scoreType: string; lanes: number; status: string }
type WorkoutLocation = { id: number; name: string }

function parseMinSec(val: string): number {
  const [m = '0', s = '0'] = val.split(':')
  return (parseInt(m) || 0) * 60 + (parseInt(s) || 0)
}

function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0:00" className="w-24 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500" />
    </div>
  )
}

export default function WorkoutsPage() {
  const { slug } = useParams<{ slug: string }>()
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const [scoreType, setScoreType] = useState('time')
  const [lanes, setLanes] = useState('5')
  const [heatInterval, setHeatInterval] = useState('10:00')
  const [timeBetweenHeats, setTimeBetweenHeats] = useState('2:00')
  const [callTime, setCallTime] = useState('10:00')
  const [walkoutTime, setWalkoutTime] = useState('2:00')
  const [startTime, setStartTime] = useState('')
  const [mixedHeats, setMixedHeats] = useState(true)
  const [tiebreakEnabled, setTiebreakEnabled] = useState(false)
  const [tiebreakScoreType, setTiebreakScoreType] = useState('time')
  const [partBEnabled, setPartBEnabled] = useState(false)
  const [partBScoreType, setPartBScoreType] = useState('time')
  const [halfWeight, setHalfWeight] = useState(false)
  const [locationId, setLocationId] = useState<string>('')
  const [locations, setLocations] = useState<WorkoutLocation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tiebreakWorkoutId, setTiebreakWorkoutId] = useState<number | null>(null)

  async function run<T>(label: string, op: () => Promise<T>): Promise<T | undefined> {
    setError(null)
    try {
      return await op()
    } catch (e) {
      setError(`${label}: ${e instanceof Error ? e.message : String(e)}`)
      return undefined
    }
  }

  const [importCsv, setImportCsv] = useState('')
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; workoutsAffected: number[]; errors: { line: number; message: string }[]; warnings: { message: string }[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [judgeImportCsv, setJudgeImportCsv] = useState('')
  const [judgeImportLoading, setJudgeImportLoading] = useState(false)
  const [judgeImportResult, setJudgeImportResult] = useState<{ imported: number; workoutsAffected: number[]; errors: { line: number; message: string }[] } | null>(null)
  const judgeFileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    await run('Load workouts', async () => {
      const [w, s, locs] = await Promise.all([
        getJson<Workout[]>(`/api/workouts?slug=${slug}`),
        getJson<{ tiebreakWorkoutId: number | null }>(`/api/settings?slug=${slug}`),
        getJson<WorkoutLocation[]>(`/api/workout-locations?slug=${slug}`),
      ])
      setWorkouts(w)
      setTiebreakWorkoutId(s.tiebreakWorkoutId ?? null)
      setLocations(locs)
    })
  }, [slug])

  useEffect(() => { void load() }, [load])

  async function saveTiebreakWorkout(workoutId: number | null) {
    setTiebreakWorkoutId(workoutId)
    await run('Save tiebreaker', () =>
      patchJson('/api/settings', { slug, tiebreakWorkoutId: workoutId }),
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const created = await run('Create workout', () =>
      postJson('/api/workouts', {
        slug,
        number: Number(number), name: name.trim(), scoreType, lanes: Number(lanes),
        heatIntervalSecs: parseMinSec(heatInterval),
        timeBetweenHeatsSecs: parseMinSec(timeBetweenHeats),
        callTimeSecs: parseMinSec(callTime),
        walkoutTimeSecs: parseMinSec(walkoutTime),
        startTime: toIsoOrNull(startTime), mixedHeats, tiebreakEnabled, tiebreakScoreType, partBEnabled, partBScoreType, halfWeight,
        locationId: locationId ? Number(locationId) : null,
      }),
    )
    if (created !== undefined) {
      setNumber(''); setName(''); setScoreType('time'); setLanes('5')
      setHeatInterval('10:00'); setTimeBetweenHeats('2:00'); setCallTime('10:00'); setWalkoutTime('2:00')
      setStartTime(''); setMixedHeats(true); setTiebreakEnabled(false); setTiebreakScoreType('time'); setPartBEnabled(false); setPartBScoreType('time'); setHalfWeight(false); setLocationId('')
      await load()
    }
    setLoading(false)
  }

  async function handleImport() {
    if (!importCsv.trim()) return
    setImportLoading(true)
    setImportResult(null)
    const res = await fetch('/api/import/heats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, csv: importCsv }),
    })
    const data = await res.json()
    setImportResult(data)
    setImportLoading(false)
    if (data.imported > 0) await load()
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => { setImportCsv(ev.target?.result as string ?? ''); setImportResult(null) }
    reader.readAsText(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleJudgeImport() {
    if (!judgeImportCsv.trim()) return
    setJudgeImportLoading(true)
    setJudgeImportResult(null)
    try {
      const res = await fetch('/api/import/judge-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, csv: judgeImportCsv }),
      })
      const data = await res.json()
      setJudgeImportResult(data)
    } catch (e) {
      setJudgeImportResult({ imported: 0, workoutsAffected: [], errors: [{ line: 0, message: e instanceof Error ? e.message : String(e) }] })
    }
    setJudgeImportLoading(false)
  }

  function handleJudgeFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => { setJudgeImportCsv(ev.target?.result as string ?? ''); setJudgeImportResult(null) }
    reader.readAsText(file)
    if (judgeFileInputRef.current) judgeFileInputRef.current.value = ''
  }

  const base = `/${slug}/admin`

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-white">Workouts</h1>

      {error && (
        <div role="alert" className="bg-red-950 border border-red-900 text-red-200 rounded-lg px-4 py-3 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-3 text-red-400 hover:text-red-200 underline">dismiss</button>
        </div>
      )}

      <div className="bg-gray-900 rounded-xl p-6 max-w-2xl">
        <h2 className="text-lg font-semibold text-white mb-4">Add Workout</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
          <div><label className="block text-xs text-gray-400 mb-1">Workout #</label><input type="number" value={number} onChange={(e) => setNumber(e.target.value)} className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" required /></div>
          <div><label className="block text-xs text-gray-400 mb-1">Name</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" required /></div>
          <div><label className="block text-xs text-gray-400 mb-1">Score Type</label><select value={scoreType} onChange={(e) => setScoreType(e.target.value)} className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"><option value="time">Time (lower is better)</option><option value="rounds_reps">Rounds + Reps (higher is better)</option><option value="weight">Weight (higher is better)</option></select></div>
          {locations.length > 0 && (
            <div><label className="block text-xs text-gray-400 mb-1">Location</label>
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
          <div><label className="block text-xs text-gray-400 mb-1">Start Time (optional)</label><input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" /></div>
          <div className="col-span-2">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div onClick={() => setMixedHeats((v) => !v)} className={`relative w-10 h-6 rounded-full transition-colors ${mixedHeats ? 'bg-orange-500' : 'bg-gray-700'}`}><span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${mixedHeats ? 'translate-x-5' : 'translate-x-1'}`} /></div>
              <div><span className="text-sm text-white font-medium">Mixed Heats</span><p className="text-xs text-gray-500">{mixedHeats ? 'Athletes from different divisions can share a heat' : 'Each heat contains only one division'}</p></div>
            </label>
          </div>
          <div className="col-span-2">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div onClick={() => setTiebreakEnabled((v) => !v)} className={`relative w-10 h-6 rounded-full transition-colors ${tiebreakEnabled ? 'bg-orange-500' : 'bg-gray-700'}`}><span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${tiebreakEnabled ? 'translate-x-5' : 'translate-x-1'}`} /></div>
              <div><span className="text-sm text-white font-medium">Tie Break Score</span><p className="text-xs text-gray-500">Enter a tiebreak score per athlete to break ties</p></div>
            </label>
          </div>
          {tiebreakEnabled && (
            <div className="col-span-2"><label className="block text-xs text-gray-400 mb-1">Tie Break Score Type</label><select value={tiebreakScoreType} onChange={(e) => setTiebreakScoreType(e.target.value)} className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"><option value="time">Time (lower is better)</option><option value="rounds_reps">Rounds + Reps (higher is better)</option><option value="weight">Weight (higher is better)</option></select></div>
          )}
          <div className="col-span-2">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div onClick={() => setPartBEnabled((v) => !v)} className={`relative w-10 h-6 rounded-full transition-colors ${partBEnabled ? 'bg-orange-500' : 'bg-gray-700'}`}><span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${partBEnabled ? 'translate-x-5' : 'translate-x-1'}`} /></div>
              <div><span className="text-sm text-white font-medium">Part A / Part B</span><p className="text-xs text-gray-500">Add a second score (Part B) to each athlete</p></div>
            </label>
          </div>
          {partBEnabled && (
            <div className="col-span-2"><label className="block text-xs text-gray-400 mb-1">Part B Score Type</label><select value={partBScoreType} onChange={(e) => setPartBScoreType(e.target.value)} className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"><option value="time">Time (lower is better)</option><option value="rounds_reps">Rounds + Reps (higher is better)</option><option value="weight">Weight (higher is better)</option></select></div>
          )}
          <div className="col-span-2">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div onClick={() => setHalfWeight((v) => !v)} className={`relative w-10 h-6 rounded-full transition-colors ${halfWeight ? 'bg-orange-500' : 'bg-gray-700'}`}><span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${halfWeight ? 'translate-x-5' : 'translate-x-1'}`} /></div>
              <div><span className="text-sm text-white font-medium">Half Weight</span><p className="text-xs text-gray-500">This workout counts at 50% on the overall leaderboard</p></div>
            </label>
          </div>
          <div className="col-span-2"><button type="submit" disabled={loading || !number || !name} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors">{loading ? 'Creating...' : 'Create Workout'}</button></div>
        </form>
      </div>

      {workouts.length > 0 && (
        <div className="space-y-2">
          {workouts.map((w) => (
            <Link key={w.id} href={`${base}/workouts/${w.id}`} className="flex items-center justify-between bg-gray-900 hover:bg-gray-800 rounded-xl px-5 py-4 transition-colors">
              <div>
                <span className="font-semibold text-white">WOD {w.number}: {w.name}</span>
                <span className="text-gray-400 text-sm ml-3">{w.lanes} lanes · {scoreTypeLabel(w.scoreType)}</span>
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusStyle(w.status).className}`}>{w.status}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="bg-gray-900 rounded-xl p-6 max-w-sm">
        <h2 className="text-lg font-semibold text-white mb-1">Leaderboard Tiebreaker</h2>
        <p className="text-xs text-gray-500 mb-4">
          If athletes are still tied after comparing all workout placements, use the raw score from this workout to determine final placement.
        </p>
        <select
          value={tiebreakWorkoutId ?? ''}
          onChange={(e) => saveTiebreakWorkout(e.target.value ? Number(e.target.value) : null)}
          className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          <option value="">None</option>
          {workouts.map((w) => (
            <option key={w.id} value={w.id}>WOD {w.number}: {w.name}</option>
          ))}
        </select>
      </div>

      <div className="bg-gray-900 rounded-xl p-6 max-w-2xl">
        <h2 className="text-lg font-semibold text-white mb-1">Import Heat Assignments</h2>
        <p className="text-xs text-gray-500 mb-4">CSV columns: <span className="font-mono text-gray-400">workout_number, heat_number, lane_number, athlete_name</span><br />Overwrites existing assignments for any workout included in the file.</p>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <button onClick={() => fileInputRef.current?.click()} className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">Choose File</button>
            <span className="text-xs text-gray-500">or paste CSV below</span>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={handleFileSelect} />
          </div>
          <textarea value={importCsv} onChange={(e) => { setImportCsv(e.target.value); setImportResult(null) }} placeholder={`workout_number,heat_number,lane_number,athlete_name\n1,1,1,Jane Smith\n1,1,2,John Doe`} rows={8} className="w-full bg-gray-800 text-white rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-gray-600" />
          <div className="flex items-center gap-3">
            <button onClick={handleImport} disabled={importLoading || !importCsv.trim()} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-lg px-5 py-2 text-sm transition-colors">{importLoading ? 'Importing…' : 'Import'}</button>
            {importCsv && <button onClick={() => { setImportCsv(''); setImportResult(null) }} className="text-sm text-gray-400 hover:text-white transition-colors">Clear</button>}
          </div>
        </div>
        {importResult && (
          <div className="mt-4 space-y-3">
            {importResult.imported > 0 && <div className="bg-green-900/40 border border-green-700 rounded-lg px-4 py-3 text-sm text-green-300">Imported {importResult.imported} assignment{importResult.imported !== 1 ? 's' : ''} across workout{importResult.workoutsAffected.length !== 1 ? 's' : ''} {importResult.workoutsAffected.map((n) => `#${n}`).join(', ')}.</div>}
            {importResult.errors.length > 0 && <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-sm space-y-1"><p className="text-red-300 font-medium mb-2">{importResult.errors.length} error{importResult.errors.length !== 1 ? 's' : ''}:</p>{importResult.errors.map((e, i) => <p key={i} className="text-red-400"><span className="text-red-600 font-mono text-xs mr-2">Line {e.line}</span>{e.message}</p>)}</div>}
            {importResult.imported === 0 && importResult.errors.length === 0 && <div className="bg-gray-800 rounded-lg px-4 py-3 text-sm text-gray-400">Nothing was imported.</div>}
          </div>
        )}
      </div>

      <div className="bg-gray-900 rounded-xl p-6 max-w-2xl">
        <h2 className="text-lg font-semibold text-white mb-1">Import Judge Assignments</h2>
        <p className="text-xs text-gray-500 mb-4">CSV columns: <span className="font-mono text-gray-400">workout_number, heat_number, lane, judge_name</span><br />Judge must be a volunteer with a &ldquo;Judge&rdquo; role. Overwrites existing assignment for that lane.</p>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <button onClick={() => judgeFileInputRef.current?.click()} className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">Choose File</button>
            <span className="text-xs text-gray-500">or paste CSV below</span>
            <input ref={judgeFileInputRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={handleJudgeFileSelect} />
          </div>
          <textarea value={judgeImportCsv} onChange={(e) => { setJudgeImportCsv(e.target.value); setJudgeImportResult(null) }} placeholder={`workout_number,heat_number,lane,judge_name\n1,1,3,Alice Johnson\n1,2,1,Bob Smith`} rows={8} className="w-full bg-gray-800 text-white rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-gray-600" />
          <div className="flex items-center gap-3">
            <button onClick={handleJudgeImport} disabled={judgeImportLoading || !judgeImportCsv.trim()} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-lg px-5 py-2 text-sm transition-colors">{judgeImportLoading ? 'Importing…' : 'Import'}</button>
            {judgeImportCsv && <button onClick={() => { setJudgeImportCsv(''); setJudgeImportResult(null) }} className="text-sm text-gray-400 hover:text-white transition-colors">Clear</button>}
          </div>
        </div>
        {judgeImportResult && (
          <div className="mt-4 space-y-3">
            {judgeImportResult.imported > 0 && <div className="bg-green-900/40 border border-green-700 rounded-lg px-4 py-3 text-sm text-green-300">Imported {judgeImportResult.imported} assignment{judgeImportResult.imported !== 1 ? 's' : ''} across workout{judgeImportResult.workoutsAffected.length !== 1 ? 's' : ''} {judgeImportResult.workoutsAffected.map((n) => `#${n}`).join(', ')}.</div>}
            {judgeImportResult.errors.length > 0 && <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-sm space-y-1"><p className="text-red-300 font-medium mb-2">{judgeImportResult.errors.length} error{judgeImportResult.errors.length !== 1 ? 's' : ''}:</p>{judgeImportResult.errors.map((e, i) => <p key={i} className="text-red-400"><span className="text-red-600 font-mono text-xs mr-2">Line {e.line}</span>{e.message}</p>)}</div>}
            {judgeImportResult.imported === 0 && judgeImportResult.errors.length === 0 && <div className="bg-gray-800 rounded-lg px-4 py-3 text-sm text-gray-400">Nothing was imported.</div>}
          </div>
        )}
      </div>
    </div>
  )
}
