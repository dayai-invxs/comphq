'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { getJson, postJson, patchJson, delJson } from '@/lib/http'

type Comp = { id: number; name: string; slug: string }
type UserRow = {
  id: string
  email: string | null
  isSuper: boolean
  competitions: Comp[]
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [comps, setComps] = useState<Comp[]>([])
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(false)
  const [err, setErr] = useState('')

  // Add-user form state
  const [showAdd, setShowAdd] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newIsSuper, setNewIsSuper] = useState(false)
  const [newComps, setNewComps] = useState<Set<number>>(new Set())
  const [addLoading, setAddLoading] = useState(false)

  // Per-row editing
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editIsSuper, setEditIsSuper] = useState(false)
  const [editComps, setEditComps] = useState<Set<number>>(new Set())
  const [editLoading, setEditLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const [rows, compsData] = await Promise.all([
        getJson<UserRow[]>('/api/users'),
        getJson<Comp[]>('/api/competitions'),
      ])
      setUsers(rows)
      setComps(compsData)
      setAuthError(false)
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status
      if (status === 403 || status === 401) setAuthError(true)
      else setErr((e as Error).message || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  async function addUser() {
    setErr(''); setAddLoading(true)
    try {
      await postJson('/api/users', {
        email: newEmail.trim(),
        password: newPassword,
        isSuper: newIsSuper,
        competitionIds: Array.from(newComps),
      })
      setNewEmail(''); setNewPassword(''); setNewIsSuper(false); setNewComps(new Set())
      setShowAdd(false)
      await refresh()
    } catch (e: unknown) {
      setErr((e as Error).message || 'Failed to add user')
    } finally {
      setAddLoading(false)
    }
  }

  function startEdit(u: UserRow) {
    setEditingId(u.id)
    setEditIsSuper(u.isSuper)
    setEditComps(new Set(u.competitions.map((c) => c.id)))
  }

  async function saveEdit(userId: string) {
    setErr(''); setEditLoading(true)
    try {
      await patchJson(`/api/users/${userId}`, {
        isSuper: editIsSuper,
        competitionIds: Array.from(editComps),
      })
      setEditingId(null)
      await refresh()
    } catch (e: unknown) {
      setErr((e as Error).message || 'Failed to save')
    } finally {
      setEditLoading(false)
    }
  }

  async function deleteUser(u: UserRow) {
    if (!confirm(`Delete user ${u.email}? This cannot be undone.`)) return
    setErr('')
    try {
      await delJson(`/api/users/${u.id}`)
      await refresh()
    } catch (e: unknown) {
      setErr((e as Error).message || 'Failed to delete')
    }
  }

  async function sendResetEmail(u: UserRow) {
    if (!u.email) return
    setErr('')
    try {
      await postJson(`/api/users/${u.id}/reset-password`, {})
      alert(`Password reset email sent to ${u.email}.`)
    } catch (e: unknown) {
      setErr((e as Error).message || 'Failed to send reset email')
    }
  }

  if (authError) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-white mb-2">Users</h1>
        <p className="text-red-400">Super-admin access required.</p>
        <Link href="/admin" className="text-blue-400 hover:text-blue-300 text-sm mt-4 inline-block">← Back to admin</Link>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-gray-400 mt-1">Manage admins and competition access</p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors"
        >
          {showAdd ? 'Cancel' : 'Add User'}
        </button>
      </div>

      {err && <div className="bg-red-900/50 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">{err}</div>}

      {showAdd && (
        <div className="bg-gray-900 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Add User</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="new-user-email" className="block text-xs text-gray-400 mb-1">Email</label>
              <input
                id="new-user-email" name="email"
                type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>
            <div>
              <label htmlFor="new-user-password" className="block text-xs text-gray-400 mb-1">Password (12+ chars)</label>
              <input
                id="new-user-password" name="password"
                type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                required minLength={12}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input type="checkbox" checked={newIsSuper} onChange={(e) => setNewIsSuper(e.target.checked)} />
            Super admin (full access to every competition)
          </label>

          {!newIsSuper && comps.length > 0 && (
            <div>
              <label className="block text-xs text-gray-400 mb-2">Grant admin on which competitions?</label>
              <div className="space-y-1">
                {comps.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newComps.has(c.id)}
                      onChange={(e) => {
                        const next = new Set(newComps)
                        if (e.target.checked) next.add(c.id); else next.delete(c.id)
                        setNewComps(next)
                      }}
                    />
                    {c.name} <span className="text-xs text-gray-500">({c.slug})</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={addUser}
            disabled={addLoading || !newEmail.trim() || newPassword.length < 12}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-lg px-5 py-2 text-sm transition-colors"
          >
            {addLoading ? 'Adding…' : 'Add User'}
          </button>
        </div>
      )}

      <div className="bg-gray-900 rounded-xl overflow-hidden">
        {loading && <div className="px-5 py-4 text-gray-400">Loading…</div>}
        {!loading && users.map((u) => (
          <div key={u.id} className="border-b border-gray-800 last:border-0 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-medium">{u.email ?? '(no email)'}</span>
                  {u.isSuper && <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">super</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {u.isSuper && <span className="text-xs text-gray-500">all competitions</span>}
                  {!u.isSuper && u.competitions.length === 0 && <span className="text-xs text-gray-500">no competition access</span>}
                  {u.competitions.map((c) => (
                    <span key={c.id} className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded">
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 text-sm">
                <button onClick={() => sendResetEmail(u)} className="text-blue-400 hover:text-blue-300">Reset pw</button>
                <button onClick={() => editingId === u.id ? setEditingId(null) : startEdit(u)} className="text-blue-400 hover:text-blue-300">
                  {editingId === u.id ? 'Cancel' : 'Edit'}
                </button>
                <button onClick={() => deleteUser(u)} className="text-red-400 hover:text-red-300">Delete</button>
              </div>
            </div>

            {editingId === u.id && (
              <div className="mt-4 space-y-3 bg-gray-800/40 rounded-lg p-4">
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input
                    type="checkbox" checked={editIsSuper}
                    onChange={(e) => setEditIsSuper(e.target.checked)}
                  />
                  Super admin
                </label>
                {!editIsSuper && (
                  <div>
                    <div className="text-xs text-gray-400 mb-2">Competitions</div>
                    <div className="space-y-1">
                      {comps.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editComps.has(c.id)}
                            onChange={(e) => {
                              const next = new Set(editComps)
                              if (e.target.checked) next.add(c.id); else next.delete(c.id)
                              setEditComps(next)
                            }}
                          />
                          {c.name} <span className="text-xs text-gray-500">({c.slug})</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  onClick={() => saveEdit(u.id)}
                  disabled={editLoading}
                  className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2"
                >
                  {editLoading ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
        ))}
        {!loading && users.length === 0 && (
          <div className="px-5 py-8 text-center text-gray-500">No users yet.</div>
        )}
      </div>
    </div>
  )
}
