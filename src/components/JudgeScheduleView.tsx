'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { SlugNav } from '@/components/SlugNav'
import { getJson } from '@/lib/http'
import { getSupabaseClient } from '@/lib/supabase-client'

const DEFAULT_PASSWORD = 'rug702'
const SESSION_KEY = 'judgeUnlocked'

type JudgeAssignment = { judgeId: number; judgeName: string; lane: number }
type Heat = { heatNumber: number; heatTimeMs: number | null; walkoutTimeMs: number | null; assignments: JudgeAssignment[] }

function fmtTime(ms: number | null): string {
  if (ms == null) return '—'
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
type WorkoutData = { id: number; number: number; name: string; locationName: string | null; heats: Heat[] }
type Judge = { id: number; name: string }
type ScheduleData = { judges: Judge[]; workouts: WorkoutData[] }

function PasswordGate({ password, onUnlock }: { password: string; onUnlock: () => void }) {
  const [value, setValue] = useState('')
  const [wrong, setWrong] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function submit() {
    if (value === password) {
      sessionStorage.setItem(SESSION_KEY, '1')
      onUnlock()
    } else {
      setWrong(true)
      setValue('')
      inputRef.current?.focus()
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-950 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-10 w-full max-w-sm flex flex-col items-center gap-5">
        <h2 className="text-2xl font-bold text-white">Judge Access</h2>
        <input
          ref={inputRef}
          type="password"
          placeholder="Enter password"
          value={value}
          onChange={e => { setValue(e.target.value); setWrong(false) }}
          onKeyDown={e => e.key === 'Enter' && submit()}
          className="w-full rounded-lg bg-gray-900 border border-gray-600 text-white placeholder-gray-500 px-4 py-2.5 text-center text-lg focus:outline-none focus:border-orange-500"
        />
        {wrong && <p className="text-red-400 text-sm -mt-2">Incorrect password</p>}
        <button
          onClick={submit}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg py-2.5 transition-colors"
        >
          Enter
        </button>
      </div>
    </div>
  )
}

function findViolations(workouts: WorkoutData[], maxConsecutive: number): Set<string> {
  const violations = new Set<string>()
  for (const wk of workouts) {
    const judgeHeats = new Map<number, number[]>()
    for (const heat of wk.heats) {
      for (const a of heat.assignments) {
        if (!judgeHeats.has(a.judgeId)) judgeHeats.set(a.judgeId, [])
        judgeHeats.get(a.judgeId)!.push(heat.heatNumber)
      }
    }
    for (const [judgeId, heats] of judgeHeats) {
      heats.sort((a, b) => a - b)
      let run = 1
      for (let i = 0; i < heats.length; i++) {
        if (i > 0 && heats[i] === heats[i - 1] + 1) {
          run++
        } else {
          run = 1
        }
        if (run > maxConsecutive) {
          violations.add(`${wk.id}-${judgeId}-${heats[i]}`)
        }
      }
    }
  }
  return violations
}

export default function JudgeScheduleView({ slug }: { slug: string }) {
  const [gateState, setGateState] = useState<'checking' | 'gated' | 'unlocked'>('checking')
  const [judgePassword, setJudgePassword] = useState(DEFAULT_PASSWORD)
  const [judgeMaxConsecutive, setJudgeMaxConsecutive] = useState(3)
  const [data, setData] = useState<ScheduleData | null>(null)
  const [filter, setFilter] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getJson<{ judgePassword?: string; judgeMaxConsecutive?: number }>(`/api/settings?slug=${slug}`)
      .then(d => {
        if (cancelled) return
        setJudgePassword(d.judgePassword ?? DEFAULT_PASSWORD)
        if (d.judgeMaxConsecutive != null) setJudgeMaxConsecutive(d.judgeMaxConsecutive)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [slug])

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === '1') {
      setGateState('unlocked')
      return
    }
    const supabase = getSupabaseClient()
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      if (user) { setGateState('unlocked'); return }
      if (!cancelled) setGateState('gated')
    })()
    return () => { cancelled = true }
  }, [slug])

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

  // Violations computed from the full (unfiltered) dataset so consecutive runs
  // aren't broken by the search filter.
  const violations = useMemo(
    () => data ? findViolations(data.workouts, judgeMaxConsecutive) : new Set<string>(),
    [data, judgeMaxConsecutive],
  )

  if (gateState === 'checking') return null
  if (gateState === 'gated') return <PasswordGate password={judgePassword} onUnlock={() => setGateState('unlocked')} />

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
                        {(heat.walkoutTimeMs != null || heat.heatTimeMs != null) && (
                          <p className="text-xs text-gray-400 mt-0.5 flex gap-3">
                            {heat.walkoutTimeMs != null && <span>Walk out: <span className="text-white font-mono">{fmtTime(heat.walkoutTimeMs)}</span></span>}
                            {heat.heatTimeMs != null && <span>Start: <span className="text-white font-mono">{fmtTime(heat.heatTimeMs)}</span></span>}
                          </p>
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
                          {heat.assignments.map(a => {
                            const violation = violations.has(`${wk.id}-${a.judgeId}-${heat.heatNumber}`)
                            return (
                              <tr key={a.lane} className={`border-t border-gray-800 ${violation ? 'bg-red-950/50' : ''}`}>
                                <td className={`px-3 py-2 font-bold ${violation ? 'text-red-400' : 'text-orange-400'}`}>{a.lane}</td>
                                <td className={`px-3 py-2 font-medium ${violation ? 'text-red-300' : 'text-white'}`}>
                                  {a.judgeName}
                                  {violation && <span className="ml-1.5 text-xs text-red-400" title={`Exceeds max consecutive heats (${judgeMaxConsecutive})`}>⚠</span>}
                                </td>
                              </tr>
                            )
                          })}
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
