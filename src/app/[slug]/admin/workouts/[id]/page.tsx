'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { timeToMs, msToTimeParts, roundsRepsToScore, scoreToRoundsReps, formatScore, formatTiebreak, REPS_MULTIPLIER } from '@/lib/scoreFormat'
import { calcHeatStartMs } from '@/lib/heatTime'

type Division = { id: number; name: string; order: number }
type Athlete = { id: number; name: string; bibNumber: string | null; division: Division | null }
type Assignment = { id: number; heatNumber: number; lane: number; athlete: Athlete }
type Score = { id: number; athleteId: number; rawScore: number; tiebreakRawScore: number | null; points: number | null; partBRawScore: number | null; partBPoints: number | null; athlete: Athlete }
type Workout = {
  id: number; number: number; name: string; scoreType: string; lanes: number
  heatIntervalSecs: number; timeBetweenHeatsSecs: number; callTimeSecs: number; walkoutTimeSecs: number
  startTime: string | null; status: string; mixedHeats: boolean; tiebreakEnabled: boolean
  partBEnabled: boolean; partBScoreType: string; heatStartOverrides: string; completedHeats: string
  assignments: Assignment[]; scores: Score[]
}
type RRField = { rounds: string; reps: string }
type TimeField = string

function parseTimeInput(str: string): number {
  const s = str.trim()
  if (!s) return 0
  const m = s.match(/^(\d+):(\d{1,2})(?:[.:](\d{1,3}))?$/)
  if (!m) return 0
  const mins = parseInt(m[1]) || 0, secs = parseInt(m[2]) || 0
  const ms = m[3] ? parseInt(m[3].padEnd(3, '0')) : 0
  return timeToMs(mins, secs, ms)
}

function formatTimeInput(ms: number): string {
  const { mins, secs, ms: millis } = msToTimeParts(ms)
  const ss = String(secs).padStart(2, '0')
  if (millis > 0) return `${mins}:${ss}.${String(millis).padStart(3, '0')}`
  return `${mins}:${ss}`
}

const statusColor: Record<string, string> = {
  draft: 'bg-gray-700 text-gray-300',
  active: 'bg-green-900 text-green-300',
  completed: 'bg-blue-900 text-blue-300',
}

const SCORE_TYPE_LABELS: Record<string, string> = {
  time: 'Time', rounds_reps: 'Rounds + Reps', weight: 'Weight',
  lower_is_better: 'Time', higher_is_better: 'Reps / Weight',
}

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
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0:00" className="w-24 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500" />
    </div>
  )
}

export default function WorkoutDetailPage() {
  const { slug, id } = useParams<{ slug: string; id: string }>()
  const router = useRouter()
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [weightInputs, setWeightInputs] = useState<Record<number, string>>({})
  const [timeInputs, setTimeInputs] = useState<Record<number, string>>({})
  const [rrInputs, setRrInputs] = useState<Record<number, RRField>>({})
  const [tiebreakInputs, setTiebreakInputs] = useState<Record<number, string>>({})
  const [partBTimeInputs, setPartBTimeInputs] = useState<Record<number, string>>({})
  const [partBWeightInputs, setPartBWeightInputs] = useState<Record<number, string>>({})
  const [partBRrInputs, setPartBRrInputs] = useState<Record<number, RRField>>({})
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [editing, setEditing] = useState(false)
  const [editingHeatTime, setEditingHeatTime] = useState<number | null>(null)
  const [heatTimeInput, setHeatTimeInput] = useState('')
  const [editingAssignment, setEditingAssignment] = useState<number | null>(null)
  const [assignEditHeat, setAssignEditHeat] = useState('')
  const [assignEditLane, setAssignEditLane] = useState('')
  const [editName, setEditName] = useState('')
  const [editNumber, setEditNumber] = useState('')
  const [editScoreType, setEditScoreType] = useState('time')
  const [editLanes, setEditLanes] = useState('')
  const [editHeatInterval, setEditHeatInterval] = useState<TimeField>('10:00')
  const [editTimeBetweenHeats, setEditTimeBetweenHeats] = useState<TimeField>('2:00')
  const [editCallTime, setEditCallTime] = useState<TimeField>('5:00')
  const [editWalkoutTime, setEditWalkoutTime] = useState<TimeField>('1:00')
  const [editStartTime, setEditStartTime] = useState('')
  const [editMixedHeats, setEditMixedHeats] = useState(true)
  const [editTiebreakEnabled, setEditTiebreakEnabled] = useState(false)
  const [editPartBEnabled, setEditPartBEnabled] = useState(false)
  const [editPartBScoreType, setEditPartBScoreType] = useState('time')

  const workoutsPath = `/${slug}/admin/workouts`

  const load = useCallback(async () => {
    const res = await fetch(`/api/workouts/${id}`, { cache: 'no-store' })
    if (!res.ok) return router.push(workoutsPath)
    const data: Workout = await res.json()
    setWorkout(data)
    const wI: Record<number, string> = {}, tI: Record<number, string> = {}, rI: Record<number, RRField> = {}, tbI: Record<number, string> = {}
    const bTI: Record<number, string> = {}, bWI: Record<number, string> = {}, bRI: Record<number, RRField> = {}
    for (const s of data.scores) {
      if (data.scoreType === 'time') { tI[s.athleteId] = formatTimeInput(s.rawScore) }
      else if (data.scoreType === 'rounds_reps') {
        const rr = scoreToRoundsReps(s.rawScore)
        rI[s.athleteId] = { rounds: String(rr.rounds), reps: String(rr.reps) }
        if (s.tiebreakRawScore != null) tbI[s.athleteId] = formatTimeInput(s.tiebreakRawScore)
      } else { wI[s.athleteId] = String(s.rawScore) }
      if (s.partBRawScore != null) {
        if (data.partBScoreType === 'time') bTI[s.athleteId] = formatTimeInput(s.partBRawScore)
        else if (data.partBScoreType === 'rounds_reps') { const rr = scoreToRoundsReps(s.partBRawScore); bRI[s.athleteId] = { rounds: String(rr.rounds), reps: String(rr.reps) } }
        else bWI[s.athleteId] = String(s.partBRawScore)
      }
    }
    setWeightInputs(wI); setTimeInputs(tI); setRrInputs(rI); setTiebreakInputs(tbI)
    setPartBTimeInputs(bTI); setPartBWeightInputs(bWI); setPartBRrInputs(bRI)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, workoutsPath])

  useEffect(() => { load() }, [load])

  function openEdit() {
    if (!workout) return
    setEditName(workout.name); setEditNumber(String(workout.number)); setEditScoreType(workout.scoreType)
    setEditLanes(String(workout.lanes)); setEditHeatInterval(secsToField(workout.heatIntervalSecs))
    setEditTimeBetweenHeats(secsToField(workout.timeBetweenHeatsSecs)); setEditCallTime(secsToField(workout.callTimeSecs))
    setEditWalkoutTime(secsToField(workout.walkoutTimeSecs)); setEditStartTime(toLocalDatetime(workout.startTime))
    setEditMixedHeats(workout.mixedHeats); setEditTiebreakEnabled(workout.tiebreakEnabled)
    setEditPartBEnabled(workout.partBEnabled); setEditPartBScoreType(workout.partBScoreType); setEditing(true)
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true)
    const res = await fetch(`/api/workouts/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editName.trim(), number: Number(editNumber), scoreType: editScoreType, lanes: Number(editLanes),
        heatIntervalSecs: fieldToSecs(editHeatInterval), timeBetweenHeatsSecs: fieldToSecs(editTimeBetweenHeats),
        callTimeSecs: fieldToSecs(editCallTime), walkoutTimeSecs: fieldToSecs(editWalkoutTime),
        startTime: editStartTime || null, mixedHeats: editMixedHeats, tiebreakEnabled: editTiebreakEnabled,
        partBEnabled: editPartBEnabled, partBScoreType: editPartBScoreType,
      }),
    })
    if (!res.ok) { setMsg('Error saving settings.'); setLoading(false); return }
    const updated = await res.json()
    setWorkout((prev) => prev ? { ...prev, ...updated } : prev)
    setEditing(false); setMsg('Settings saved.')
    await load(); setLoading(false)
  }

  async function setStatus(status: string) {
    await fetch(`/api/workouts/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    await load()
  }

  async function generateAssignments(useCumulative = false) {
    setLoading(true); setMsg('')
    const res = await fetch(`/api/workouts/${id}/assignments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ useCumulative }) })
    if (res.ok) setMsg('Heat assignments generated.')
    await load(); setLoading(false)
  }

  function startEditHeatTime(heatNum: number) {
    if (!workout?.startTime) return
    const ms = calcHeatStartMs(heatNum, workout.startTime, workout.heatIntervalSecs, workout.heatStartOverrides, workout.timeBetweenHeatsSecs)
    if (ms == null) return
    const d = new Date(ms)
    setHeatTimeInput(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
    setEditingHeatTime(heatNum)
  }

  async function saveHeatTime(heatNum: number) {
    if (!workout?.startTime || !heatTimeInput) return
    const currentMs = calcHeatStartMs(heatNum, workout.startTime, workout.heatIntervalSecs, workout.heatStartOverrides, workout.timeBetweenHeatsSecs)
    const baseDate = currentMs != null ? new Date(currentMs) : new Date(workout.startTime)
    const [hh, mm] = heatTimeInput.split(':').map(Number)
    const newHeatDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hh, mm, 0, 0)
    await fetch(`/api/workouts/${id}/heat-times`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ heatNumber: heatNum, isoTime: newHeatDate.toISOString() }) })
    setEditingHeatTime(null); await load()
  }

  function startEditAssignment(a: Assignment) {
    setEditingAssignment(a.id); setAssignEditHeat(String(a.heatNumber)); setAssignEditLane(String(a.lane))
  }

  async function saveAssignment(assignmentId: number) {
    await fetch(`/api/workouts/${id}/assignments`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: assignmentId, heatNumber: Number(assignEditHeat), lane: Number(assignEditLane) }) })
    setEditingAssignment(null); await load()
  }

  async function saveScore(athleteId: number) {
    if (!workout) return
    let rawScore: number, tiebreakRawScore: number | null = null, partBRawScore: number | null = null
    if (workout.scoreType === 'time') { rawScore = parseTimeInput(timeInputs[athleteId] ?? ''); if (rawScore === 0) return }
    else if (workout.scoreType === 'rounds_reps') {
      const r = rrInputs[athleteId]; if (!r) return
      rawScore = roundsRepsToScore(Number(r.rounds) || 0, Number(r.reps) || 0)
      if (workout.tiebreakEnabled) { const tb = tiebreakInputs[athleteId]; if (tb) tiebreakRawScore = parseTimeInput(tb) || null }
    } else { const raw = weightInputs[athleteId]; if (raw === undefined || raw === '') return; rawScore = Number(raw) }
    if (workout.partBEnabled) {
      if (workout.partBScoreType === 'time') partBRawScore = parseTimeInput(partBTimeInputs[athleteId] ?? '') || null
      else if (workout.partBScoreType === 'rounds_reps') { const r = partBRrInputs[athleteId]; if (r) partBRawScore = roundsRepsToScore(Number(r.rounds) || 0, Number(r.reps) || 0) || null }
      else { const raw = partBWeightInputs[athleteId]; if (raw !== undefined && raw !== '') partBRawScore = Number(raw) }
    }
    await fetch(`/api/workouts/${id}/scores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ athleteId, rawScore, tiebreakRawScore, partBRawScore }) })
  }

  async function saveAllScores() {
    setLoading(true)
    await Promise.all((workout?.assignments ?? []).map((a) => saveScore(a.athlete.id)))
    await load(); setLoading(false); setMsg('All scores saved.')
  }

  async function saveHeatScores(heatNum: number) {
    if (!workout) return; setLoading(true)
    const athleteIds = workout.assignments.filter((a) => a.heatNumber === heatNum).map((a) => a.athlete.id)
    await Promise.all(athleteIds.map(saveScore))
    await load(); setLoading(false); setMsg(`Heat ${heatNum} scores saved.`)
  }

  async function completeHeat(heatNum: number) {
    setLoading(true)
    const athleteIds = workout?.assignments.filter((a) => a.heatNumber === heatNum).map((a) => a.athlete.id) ?? []
    await Promise.all(athleteIds.map(saveScore))
    await fetch(`/api/workouts/${id}/heats/${heatNum}/complete`, { method: 'POST' })
    setMsg(`Heat ${heatNum} completed. Rankings updated.`); await load(); setLoading(false)
  }

  async function undoHeat(heatNum: number) {
    setLoading(true)
    await fetch(`/api/workouts/${id}/heats/${heatNum}/complete`, { method: 'DELETE' })
    setMsg(`Heat ${heatNum} reopened.`); await load(); setLoading(false)
  }

  async function clearScores() {
    if (!confirm('Clear all scores for this workout? This will also reset the workout to active.')) return
    setLoading(true)
    await fetch(`/api/workouts/${id}/scores`, { method: 'DELETE' })
    setWeightInputs({}); setTimeInputs({}); setRrInputs({}); setTiebreakInputs({})
    setMsg('All scores cleared.'); await load(); setLoading(false)
  }

  async function calculateRankings() {
    setLoading(true); await saveAllScores()
    const res = await fetch(`/api/workouts/${id}/calculate`, { method: 'POST' })
    if (res.ok) setMsg('Rankings calculated. Workout marked as completed.')
    await load(); setLoading(false)
  }

  async function deleteWorkout() {
    if (!confirm('Delete this workout?')) return
    await fetch(`/api/workouts/${id}`, { method: 'DELETE' })
    router.push(workoutsPath)
  }

  if (!workout) return <div className="text-gray-400">Loading...</div>

  const byHeat = workout.assignments.reduce<Record<number, Assignment[]>>((acc, a) => { ;(acc[a.heatNumber] ??= []).push(a); return acc }, {})
  const heatNums = Object.keys(byHeat).map(Number).sort((a, b) => a - b)
  const scoredCount = workout.scores.filter((s) => s.rawScore != null).length
  const totalAthletes = workout.assignments.length
  const someScored = scoredCount > 0
  const completedHeatNums: number[] = JSON.parse(workout.completedHeats || '[]')

  function heatStartTime(heatNumber: number): string | null {
    if (!workout?.startTime) return null
    const ms = calcHeatStartMs(heatNumber, workout.startTime, workout.heatIntervalSecs, workout.heatStartOverrides, workout.timeBetweenHeatsSecs)
    return ms != null ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null
  }

  function heatMs(heatNumber: number): number | null {
    if (!workout?.startTime) return null
    return calcHeatStartMs(heatNumber, workout.startTime, workout.heatIntervalSecs, workout.heatStartOverrides, workout.timeBetweenHeatsSecs)
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">WOD {workout.number}: {workout.name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusColor[workout.status] ?? 'bg-gray-700 text-gray-300'}`}>{workout.status}</span>
            <span className="text-gray-400 text-sm">{workout.lanes} lanes · {SCORE_TYPE_LABELS[workout.scoreType] ?? workout.scoreType} · {workout.mixedHeats ? 'Mixed heats' : 'Separate heats'} · {Math.floor(workout.timeBetweenHeatsSecs / 60)}m {workout.timeBetweenHeatsSecs % 60 > 0 ? `${workout.timeBetweenHeatsSecs % 60}s ` : ''}between heats</span>
            {workout.startTime && <span className="text-gray-400 text-sm">Starts {new Date(workout.startTime).toLocaleString()}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={openEdit} className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">Edit Settings</button>
          {workout.status === 'draft' && <button onClick={() => setStatus('active')} className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">Activate</button>}
          {workout.status === 'active' && <button onClick={() => setStatus('draft')} className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">Deactivate</button>}
          {workout.status === 'completed' && <button onClick={() => setStatus('active')} className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">Reactivate</button>}
          <button onClick={deleteWorkout} className="bg-red-900 hover:bg-red-800 text-red-300 text-sm font-medium rounded-lg px-4 py-2 transition-colors">Delete</button>
        </div>
      </div>

      {editing && (
        <div className="bg-gray-900 rounded-xl p-6 border border-orange-500/30">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-white">Edit Settings</h2>
            <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-white text-sm transition-colors">Cancel</button>
          </div>
          <form onSubmit={saveEdit} className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs text-gray-400 mb-1">Workout #</label><input type="number" value={editNumber} onChange={(e) => setEditNumber(e.target.value)} className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" required /></div>
            <div><label className="block text-xs text-gray-400 mb-1">Name</label><input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" required /></div>
            <div><label className="block text-xs text-gray-400 mb-1">Score Type</label><select value={editScoreType} onChange={(e) => setEditScoreType(e.target.value)} className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"><option value="time">Time (lower is better)</option><option value="rounds_reps">Rounds + Reps (higher is better)</option><option value="weight">Weight (higher is better)</option></select></div>
            <div><label className="block text-xs text-gray-400 mb-1">Lanes</label><input type="number" value={editLanes} onChange={(e) => setEditLanes(e.target.value)} className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" required /></div>
            <TimeInput label="Heat Interval" value={editHeatInterval} onChange={setEditHeatInterval} />
            <TimeInput label="Time Between Heats" value={editTimeBetweenHeats} onChange={setEditTimeBetweenHeats} />
            <TimeInput label="Corral Call (before heat)" value={editCallTime} onChange={setEditCallTime} />
            <TimeInput label="Walk Out (before heat)" value={editWalkoutTime} onChange={setEditWalkoutTime} />
            <div><label className="block text-xs text-gray-400 mb-1">Start Time</label><input type="datetime-local" value={editStartTime} onChange={(e) => setEditStartTime(e.target.value)} className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" /></div>
            <div className="col-span-2"><label className="flex items-center gap-3 cursor-pointer select-none"><div onClick={() => setEditMixedHeats((v) => !v)} className={`relative w-10 h-6 rounded-full transition-colors ${editMixedHeats ? 'bg-orange-500' : 'bg-gray-700'}`}><span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${editMixedHeats ? 'translate-x-5' : 'translate-x-1'}`} /></div><div><span className="text-sm text-white font-medium">Mixed Heats</span><p className="text-xs text-gray-500">{editMixedHeats ? 'Athletes from different divisions can share a heat' : 'Each heat contains only one division'}</p></div></label></div>
            {editScoreType === 'rounds_reps' && <div className="col-span-2"><label className="flex items-center gap-3 cursor-pointer select-none"><div onClick={() => setEditTiebreakEnabled((v) => !v)} className={`relative w-10 h-6 rounded-full transition-colors ${editTiebreakEnabled ? 'bg-orange-500' : 'bg-gray-700'}`}><span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${editTiebreakEnabled ? 'translate-x-5' : 'translate-x-1'}`} /></div><div><span className="text-sm text-white font-medium">Tie Break Time</span><p className="text-xs text-gray-500">Enter a tiebreak time per athlete — lowest time wins ties</p></div></label></div>}
            <div className="col-span-2"><label className="flex items-center gap-3 cursor-pointer select-none"><div onClick={() => setEditPartBEnabled((v) => !v)} className={`relative w-10 h-6 rounded-full transition-colors ${editPartBEnabled ? 'bg-orange-500' : 'bg-gray-700'}`}><span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${editPartBEnabled ? 'translate-x-5' : 'translate-x-1'}`} /></div><div><span className="text-sm text-white font-medium">Part A / Part B</span><p className="text-xs text-gray-500">Add a second score (Part B) to each athlete</p></div></label></div>
            {editPartBEnabled && <div className="col-span-2"><label className="block text-xs text-gray-400 mb-1">Part B Score Type</label><select value={editPartBScoreType} onChange={(e) => setEditPartBScoreType(e.target.value)} className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"><option value="time">Time (lower is better)</option><option value="rounds_reps">Rounds + Reps (higher is better)</option><option value="weight">Weight (higher is better)</option></select></div>}
            <div className="col-span-2 flex gap-3">
              <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors">{loading ? 'Saving...' : 'Save Changes'}</button>
              <button type="button" onClick={() => setEditing(false)} className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-6 py-2.5 text-sm transition-colors">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {msg && <div className="bg-green-900/50 border border-green-700 text-green-300 rounded-lg px-4 py-3 text-sm">{msg}</div>}

      <div className="bg-gray-900 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-4">Heat Assignments</h2>
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => generateAssignments(false)} disabled={loading} className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">Generate (Random / Division Order)</button>
          <button onClick={() => generateAssignments(true)} disabled={loading} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">Generate (By Cumulative Points)</button>
        </div>
        <p className="text-xs text-gray-500 mt-2">Best athletes are placed in the last heat. Existing assignments are replaced.</p>
      </div>

      {heatNums.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Heats & Scores</h2>
            <div className="flex gap-3">
              <button onClick={clearScores} disabled={loading || workout.scores.length === 0} className="bg-red-900 hover:bg-red-800 disabled:opacity-50 text-red-300 text-sm font-medium rounded-lg px-4 py-2 transition-colors">Clear All Scores</button>
              <button onClick={saveAllScores} disabled={loading} className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">Save All Scores</button>
              <button onClick={calculateRankings} disabled={loading || !someScored} title={!someScored ? 'Enter at least one score first' : scoredCount < totalAthletes ? `${totalAthletes - scoredCount} athlete(s) without scores will be unranked` : ''} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">
                Calculate Rankings & Complete
                {scoredCount < totalAthletes && someScored && <span className="ml-1.5 text-blue-200 text-xs">({scoredCount}/{totalAthletes})</span>}
              </button>
            </div>
          </div>

          {heatNums.map((heatNum) => {
            const entries = (byHeat[heatNum] ?? []).sort((a, b) => a.lane - b.lane)
            const startTime = heatStartTime(heatNum)
            const isHeatComplete = completedHeatNums.includes(heatNum)
            return (
              <div key={heatNum} className={`rounded-xl overflow-hidden ${isHeatComplete ? 'opacity-60' : 'bg-gray-900'}`}>
                <div className={`px-5 py-3 flex items-center justify-between ${isHeatComplete ? 'bg-gray-700' : 'bg-gray-800'}`}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`font-semibold ${isHeatComplete ? 'text-gray-400' : 'text-orange-400'}`}>Heat {heatNum}</span>
                    {isHeatComplete && <button onClick={() => undoHeat(heatNum)} disabled={loading} className="text-xs bg-green-900 hover:bg-red-900 text-green-400 hover:text-red-400 px-2 py-0.5 rounded-full font-medium transition-colors" title="Click to un-complete">Completed</button>}
                    {!isHeatComplete && <button onClick={() => saveHeatScores(heatNum)} disabled={loading} className="text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-medium rounded px-2.5 py-1 transition-colors">Save Heat</button>}
                    {!isHeatComplete && <button onClick={() => completeHeat(heatNum)} disabled={loading} className="text-xs bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-medium rounded px-2.5 py-1 transition-colors">Complete Heat</button>}
                    {editingHeatTime === heatNum ? (
                      <div className="flex items-center gap-2">
                        <input type="time" value={heatTimeInput} onChange={(e) => setHeatTimeInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveHeatTime(heatNum); if (e.key === 'Escape') setEditingHeatTime(null) }} autoFocus className="bg-gray-700 text-white rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500" />
                        <button onClick={() => saveHeatTime(heatNum)} className="text-xs text-green-400 hover:text-green-300 font-medium">Save</button>
                        <button onClick={() => setEditingHeatTime(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                      </div>
                    ) : (
                      startTime && (
                        <span className="text-gray-400 text-sm flex items-center gap-2">
                          {startTime}
                          {(() => {
                            const ms = heatMs(heatNum)
                            if (!ms) return null
                            return <>{' · '}Corral: {new Date(ms - workout.callTimeSecs * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' · '}Walk Out: {new Date(ms - workout.walkoutTimeSecs * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>
                          })()}
                          {workout.startTime && <button onClick={() => startEditHeatTime(heatNum)} className="text-xs text-blue-400 hover:text-blue-300 transition-colors ml-1">Edit time</button>}
                        </span>
                      )
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-800/50">
                      <tr>
                        <th className="text-left px-5 py-2 text-gray-400 font-medium w-16">Lane</th>
                        <th className="text-left px-5 py-2 text-gray-400 font-medium w-16">Heat</th>
                        <th className="text-left px-5 py-2 text-gray-400 font-medium">Athlete</th>
                        <th className="text-left px-5 py-2 text-gray-400 font-medium">Division</th>
                        <th className="text-left px-5 py-2 text-gray-400 font-medium w-32">{workout.partBEnabled ? 'Part A' : 'Score'}</th>
                        {workout.partBEnabled && <th className="text-left px-5 py-2 text-gray-400 font-medium w-32">Part B</th>}
                        <th className="text-left px-5 py-2 text-gray-400 font-medium w-16">Points</th>
                        <th className="px-5 py-2 w-20" />
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((a) => {
                        const score = workout.scores.find((s) => s.athleteId === a.athlete.id)
                        const isEditingThis = editingAssignment === a.id
                        return (
                          <tr key={a.id} className={`border-t border-gray-800 ${isEditingThis ? 'bg-gray-800/40' : ''}`}>
                            <td className="px-3 py-2">{isEditingThis ? <input type="number" min="1" value={assignEditLane} onChange={(e) => setAssignEditLane(e.target.value)} className="w-14 bg-gray-700 text-white rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-500" /> : <span className="font-bold text-orange-400 px-2">{a.lane}</span>}</td>
                            <td className="px-3 py-2">{isEditingThis ? <input type="number" min="1" value={assignEditHeat} onChange={(e) => setAssignEditHeat(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveAssignment(a.id); if (e.key === 'Escape') setEditingAssignment(null) }} className="w-14 bg-gray-700 text-white rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-500" /> : <span className="text-gray-400 px-2">{a.heatNumber}</span>}</td>
                            <td className="px-5 py-3 text-white font-medium">{a.athlete.name}</td>
                            <td className="px-5 py-3 text-gray-400 text-xs">{a.athlete.division?.name ?? '—'}</td>
                            <td className="px-3 py-2">
                              {workout.scoreType === 'time' && <input type="text" value={timeInputs[a.athlete.id] ?? ''} onChange={(e) => setTimeInputs((p) => ({ ...p, [a.athlete.id]: e.target.value }))} placeholder="0:00.000" className="w-28 bg-gray-800 text-white rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-orange-500" />}
                              {workout.scoreType === 'rounds_reps' && (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1">
                                    <input type="number" min="0" value={rrInputs[a.athlete.id]?.rounds ?? ''} onChange={(e) => setRrInputs((p) => ({ ...p, [a.athlete.id]: { ...p[a.athlete.id], rounds: e.target.value } }))} placeholder="0" className="w-16 bg-gray-800 text-white rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-orange-500" />
                                    <span className="text-gray-500 text-xs">rds</span>
                                    <input type="number" min="0" max={REPS_MULTIPLIER - 1} value={rrInputs[a.athlete.id]?.reps ?? ''} onChange={(e) => setRrInputs((p) => ({ ...p, [a.athlete.id]: { ...p[a.athlete.id], reps: e.target.value } }))} placeholder="0" className="w-16 bg-gray-800 text-white rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-orange-500" />
                                    <span className="text-gray-500 text-xs">reps</span>
                                  </div>
                                  {workout.tiebreakEnabled && <div className="flex items-center gap-1"><span className="text-gray-500 text-xs w-12">TB:</span><input type="text" value={tiebreakInputs[a.athlete.id] ?? ''} onChange={(e) => setTiebreakInputs((p) => ({ ...p, [a.athlete.id]: e.target.value }))} placeholder="0:00.000" className="w-24 bg-gray-800 text-white rounded px-1.5 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-orange-500" /></div>}
                                </div>
                              )}
                              {workout.scoreType !== 'time' && workout.scoreType !== 'rounds_reps' && <input type="number" step="any" value={weightInputs[a.athlete.id] ?? ''} onChange={(e) => setWeightInputs((p) => ({ ...p, [a.athlete.id]: e.target.value }))} placeholder="Score" className="w-28 bg-gray-800 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />}
                            </td>
                            {workout.partBEnabled && (
                              <td className="px-3 py-2">
                                {workout.partBScoreType === 'time' && <input type="text" value={partBTimeInputs[a.athlete.id] ?? ''} onChange={(e) => setPartBTimeInputs((p) => ({ ...p, [a.athlete.id]: e.target.value }))} placeholder="0:00.000" className="w-28 bg-gray-800 text-white rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-orange-500" />}
                                {workout.partBScoreType === 'rounds_reps' && <div className="flex items-center gap-1"><input type="number" min="0" value={partBRrInputs[a.athlete.id]?.rounds ?? ''} onChange={(e) => setPartBRrInputs((p) => ({ ...p, [a.athlete.id]: { ...p[a.athlete.id], rounds: e.target.value } }))} placeholder="0" className="w-14 bg-gray-800 text-white rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-orange-500" /><span className="text-gray-500 text-xs">rds</span><input type="number" min="0" max={REPS_MULTIPLIER - 1} value={partBRrInputs[a.athlete.id]?.reps ?? ''} onChange={(e) => setPartBRrInputs((p) => ({ ...p, [a.athlete.id]: { ...p[a.athlete.id], reps: e.target.value } }))} placeholder="0" className="w-14 bg-gray-800 text-white rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-orange-500" /><span className="text-gray-500 text-xs">reps</span></div>}
                                {workout.partBScoreType !== 'time' && workout.partBScoreType !== 'rounds_reps' && <input type="number" step="any" value={partBWeightInputs[a.athlete.id] ?? ''} onChange={(e) => setPartBWeightInputs((p) => ({ ...p, [a.athlete.id]: e.target.value }))} placeholder="Score" className="w-28 bg-gray-800 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />}
                              </td>
                            )}
                            <td className="px-5 py-3 text-gray-300">
                              {score ? (
                                <div>
                                  <div className={`font-bold text-sm ${score.points === 1 ? 'text-yellow-400' : score.points !== null && score.points <= 3 ? 'text-orange-400' : 'text-white'}`}>{score.points != null ? `#${score.points}` : '—'}{workout.partBEnabled && score.partBPoints != null && <span className="text-gray-500 font-normal text-xs ml-1">/ B#{score.partBPoints}</span>}</div>
                                  {score.rawScore > 0 && <div className="text-xs text-gray-500">{formatScore(score.rawScore, workout.scoreType)}</div>}
                                  {score.tiebreakRawScore != null && <div className="text-xs text-blue-400">TB {formatTiebreak(score.tiebreakRawScore)}</div>}
                                </div>
                              ) : '—'}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {isEditingThis ? (
                                <div className="flex gap-2 justify-end"><button onClick={() => saveAssignment(a.id)} className="text-xs text-green-400 hover:text-green-300 font-medium">Save</button><button onClick={() => setEditingAssignment(null)} className="text-xs text-gray-400 hover:text-white">Cancel</button></div>
                              ) : (
                                <button onClick={() => startEditAssignment(a)} className="text-xs text-blue-400 hover:text-blue-300">Edit</button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {workout.status === 'completed' && workout.scores.length > 0 && (
        <div className="bg-gray-900 rounded-xl overflow-hidden">
          <div className="bg-gray-800 px-5 py-3"><h2 className="font-semibold text-white">Leaderboard — WOD {workout.number}</h2></div>
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="text-left px-5 py-2 text-gray-400 font-medium">Rank</th>
                <th className="text-left px-5 py-2 text-gray-400 font-medium">Athlete</th>
                <th className="text-left px-5 py-2 text-gray-400 font-medium">Score</th>
                <th className="text-left px-5 py-2 text-gray-400 font-medium">Points</th>
              </tr>
            </thead>
            <tbody>
              {[...workout.scores].filter((s) => s.points != null).sort((a, b) => (a.points ?? 0) - (b.points ?? 0)).map((s) => (
                <tr key={s.id} className="border-t border-gray-800">
                  <td className="px-5 py-3 font-bold text-gray-400">{s.points}</td>
                  <td className="px-5 py-3 text-white font-medium">{s.athlete.name}</td>
                  <td className="px-5 py-3 text-gray-300">{formatScore(s.rawScore, workout.scoreType)}{s.tiebreakRawScore != null && <span className="text-xs text-blue-400 ml-1">TB {formatTiebreak(s.tiebreakRawScore)}</span>}</td>
                  <td className="px-5 py-3"><span className={`font-bold ${s.points === 1 ? 'text-yellow-400' : s.points !== null && s.points <= 3 ? 'text-orange-400' : 'text-white'}`}>{s.points}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
