'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { SlugNav } from '@/components/SlugNav'
import { getJson } from '@/lib/http'
import { getSupabaseClient } from '@/lib/supabase-client'
import { useOps, useChecks, qk, type ChecksData } from '@/lib/queries'
import { useQueryClient } from '@tanstack/react-query'
import { useRealtimeInvalidation } from '@/lib/useRealtimeInvalidation'
import EquipmentControl from '@/components/EquipmentControl'

const DEFAULT_PASSWORD = 'rug702'
const SESSION_KEY = 'judgeUnlocked'

type HeatEntry = { athleteId: number; lane: number; divisionName: string | null }
type Heat = { heatNumber: number; isComplete: boolean; entries: HeatEntry[] }
type WorkoutData = { id: number; number: number; name: string; status: string; heats: Heat[] }
type OpsData = { workouts: WorkoutData[]; showBib: boolean }

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
        <h2 className="text-2xl font-bold text-white">Equipment Control</h2>
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

export default function EquipmentControlView({ slug }: { slug: string }) {
  const [gateState, setGateState] = useState<'checking' | 'gated' | 'unlocked'>('checking')
  const [judgePassword, setJudgePassword] = useState(DEFAULT_PASSWORD)
  const qc = useQueryClient()
  const { data: checksData } = useChecks(slug)
  const equipChecks = checksData?.equipChecks ?? {}

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
      if (user) {
        setGateState('unlocked')
        return
      }
      try {
        const d = await getJson<{ judgePassword?: string }>(`/api/settings?slug=${slug}`)
        if (!cancelled) setJudgePassword(d.judgePassword ?? DEFAULT_PASSWORD)
      } catch { /* use default */ }
      if (!cancelled) setGateState('gated')
    })()
    return () => { cancelled = true }
  }, [slug])

  const { data } = useOps<OpsData>(slug)
  const workouts = data?.workouts ?? []

  const realtimeKeys = useMemo(() => [qk.ops(slug)], [slug])
  useRealtimeInvalidation(realtimeKeys)

  function setEquipChecks(updater: ((prev: Record<string, boolean>) => Record<string, boolean>)) {
    const next = updater(equipChecks)
    qc.setQueryData(qk.checks(slug), (old: ChecksData | undefined) => ({ ...old, equipChecks: next, athleteChecks: old?.athleteChecks ?? {} }))
    void fetch('/api/checks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, type: 'equipment', checks: next }) })
  }

  if (gateState === 'checking') return null
  if (gateState === 'gated') return <PasswordGate password={judgePassword} onUnlock={() => setGateState('unlocked')} />

  return (
    <div className="min-h-screen flex flex-col">
      <SlugNav slug={slug} />
      <main className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <h1 className="text-3xl font-bold text-white mb-8">Equipment Control</h1>
        <EquipmentControl workouts={workouts} slug={slug} checks={equipChecks} setChecks={setEquipChecks} />
      </main>
    </div>
  )
}
