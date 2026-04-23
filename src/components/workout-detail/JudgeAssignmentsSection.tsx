'use client'

import { useCallback, useEffect, useState } from 'react'
import { getJson, postJson, delJson } from '@/lib/http'

type JudgeAssignment = {
  id: number
  workoutId: number
  volunteerId: number
  heatNumber: number
  lane: number
  judgeName: string
}

type Judge = { id: number; name: string }

type Props = {
  workoutId: string
  slug: string
  lanes: number
  heatNums: number[]
}

export default function JudgeAssignmentsSection({ workoutId, slug, lanes, heatNums }: Props) {
  const [assignments, setAssignments] = useState<JudgeAssignment[]>([])
  const [judges, setJudges] = useState<Judge[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [maxConsecutive, setMaxConsecutive] = useState(3)
  const [importText, setImportText] = useState('')
  const [showImport, setShowImport] = useState(false)

  const load = useCallback(async () => {
    try {
      const [assignmentData, judgeData] = await Promise.all([
        getJson<JudgeAssignment[]>(`/api/workouts/${workoutId}/judge-assignments?slug=${slug}`),
        getJson<Judge[]>(`/api/volunteers?slug=${slug}`).then(async (all) => {
          // Filter to judges only by checking roles
          const roles = await getJson<{ id: number; name: string }[]>(`/api/volunteer-roles?slug=${slug}`)
          const judgeRoleIds = new Set(roles.filter(r => r.name.toLowerCase() === 'judge').map(r => r.id))
          // We need role info — fetch full volunteer list with roles
          return getJson<{ id: number; name: string; roleId: number | null }[]>(`/api/volunteers?slug=${slug}`)
            .then(vols => vols.filter(v => v.roleId != null && judgeRoleIds.has(v.roleId)))
        }),
      ])
      setAssignments(assignmentData)
      setJudges(judgeData)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [workoutId, slug])

  useEffect(() => { void load() }, [load])

  async function generate() {
    setLoading(true)
    setError(null)
    try {
      const data = await postJson<JudgeAssignment[]>(
        `/api/workouts/${workoutId}/judge-assignments/generate?slug=${slug}`,
        { maxConsecutive },
      )
      setAssignments(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  async function clearAll() {
    if (!confirm('Clear all judge assignments for this workout?')) return
    setLoading(true)
    setError(null)
    try {
      await delJson(`/api/workouts/${workoutId}/judge-assignments?slug=${slug}`)
      setAssignments([])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  async function assignJudge(heatNumber: number, lane: number, volunteerId: number | null) {
    setError(null)
    if (volunteerId === null) {
      const existing = assignments.find(a => a.heatNumber === heatNumber && a.lane === lane)
      if (existing) {
        try {
          await delJson(`/api/workouts/${workoutId}/judge-assignments?slug=${slug}`, { ids: [existing.id] })
          setAssignments(prev => prev.filter(a => a.id !== existing.id))
        } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
      }
      return
    }
    try {
      await postJson(`/api/workouts/${workoutId}/judge-assignments?slug=${slug}`, { volunteerId, heatNumber, lane })
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  async function importAssignments() {
    setError(null)
    const lines = importText.split('\n').map(l => l.trim()).filter(Boolean)
    const parsed = []
    const parseErrors: string[] = []
    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim())
      if (parts.length < 3) { parseErrors.push(`Bad format: "${line}" — expected: Judge Name, Heat, Lane`); continue }
      const [judgeName, heatRaw, laneRaw] = parts
      const heatNumber = parseInt(heatRaw, 10)
      const lane = parseInt(laneRaw, 10)
      if (isNaN(heatNumber) || isNaN(lane)) { parseErrors.push(`Invalid numbers in: "${line}"`); continue }
      parsed.push({ judgeName, heatNumber, lane })
    }
    if (parseErrors.length > 0) { setError(parseErrors.join('\n')); return }
    if (parsed.length === 0) return
    setLoading(true)
    try {
      const data = await postJson<JudgeAssignment[]>(
        `/api/workouts/${workoutId}/judge-assignments?slug=${slug}&action=import`,
        { lines: parsed },
      )
      setAssignments(data)
      setImportText('')
      setShowImport(false)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }

  if (heatNums.length === 0) return null

  return (
    <div className="bg-gray-900 rounded-xl p-5">
      <h2 className="text-lg font-semibold text-white mb-4">Judge Assignments</h2>

      {error && (
        <div className="bg-red-950 border border-red-900 text-red-200 rounded-lg px-4 py-3 text-sm mb-4 whitespace-pre-wrap">
          {error}
          <button onClick={() => setError(null)} className="ml-3 text-red-400 hover:text-red-200 underline">dismiss</button>
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-end mb-5">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Max consecutive heats</label>
          <input
            type="number"
            min={1}
            max={20}
            value={maxConsecutive}
            onChange={e => setMaxConsecutive(Number(e.target.value))}
            className="w-20 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <button
          onClick={generate}
          disabled={loading || judges.length === 0}
          title={judges.length === 0 ? 'No judges found — add volunteers with a "Judge" role first' : undefined}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
        >
          Auto-Generate
        </button>
        <button
          onClick={() => setShowImport(v => !v)}
          className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
        >
          {showImport ? 'Hide Import' : 'Bulk Import'}
        </button>
        {assignments.length > 0 && (
          <button
            onClick={clearAll}
            disabled={loading}
            className="bg-red-900 hover:bg-red-800 disabled:opacity-50 text-red-300 text-sm font-medium rounded-lg px-4 py-2 transition-colors"
          >
            Clear All
          </button>
        )}
        {judges.length === 0 && (
          <span className="text-xs text-gray-500">No judges found — add volunteers with a &ldquo;Judge&rdquo; role in People.</span>
        )}
      </div>

      {showImport && (
        <div className="mb-5 bg-gray-800 rounded-xl p-4 space-y-3">
          <p className="text-xs text-gray-400">One assignment per line: <span className="font-mono text-gray-300">Judge Name, Heat, Lane</span></p>
          <textarea
            value={importText}
            onChange={e => setImportText(e.target.value)}
            placeholder={"Alice Johnson, 1, 3\nBob Smith, 2, 1"}
            rows={6}
            className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none font-mono"
          />
          <button
            onClick={importAssignments}
            disabled={loading || !importText.trim()}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
          >
            {loading ? 'Importing…' : 'Import'}
          </button>
        </div>
      )}

      <div className="space-y-4">
        {heatNums.map(heatNum => {
          const heatAssignments = assignments.filter(a => a.heatNumber === heatNum)
          const byLane = new Map(heatAssignments.map(a => [a.lane, a]))
          return (
            <div key={heatNum} className="bg-gray-800 rounded-xl overflow-hidden">
              <div className="bg-gray-700 px-5 py-3">
                <span className="font-semibold text-orange-400">Heat {heatNum}</span>
                <span className="ml-3 text-sm text-gray-400">{heatAssignments.length}/{lanes} lanes assigned</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-800/50">
                    <tr>
                      <th className="text-left px-5 py-2 text-gray-400 font-medium w-16">Lane</th>
                      <th className="text-left px-5 py-2 text-gray-400 font-medium">Judge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: lanes }, (_, i) => i + 1).map(lane => {
                      const current = byLane.get(lane)
                      return (
                        <tr key={lane} className="border-t border-gray-700">
                          <td className="px-5 py-2 font-bold text-orange-400">{lane}</td>
                          <td className="px-5 py-2">
                            <select
                              value={current?.volunteerId ?? ''}
                              onChange={e => assignJudge(heatNum, lane, e.target.value ? Number(e.target.value) : null)}
                              className="bg-gray-700 text-white rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 min-w-48"
                            >
                              <option value="">— unassigned —</option>
                              {judges.map(j => (
                                <option key={j.id} value={j.id}>{j.name}</option>
                              ))}
                            </select>
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
    </div>
  )
}
