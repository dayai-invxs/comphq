'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type CompUser = {
  userId: string
  email: string | null
  role: string
}

export default function CompetitionUsersPage() {
  const { slug } = useParams<{ slug: string }>()
  const [users, setUsers] = useState<CompUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'user'>('user')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    const r = await fetch(`/api/comp-users?slug=${slug}`)
    if (r.ok) setUsers(await r.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [slug])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const r = await fetch('/api/comp-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, email, password, role }),
    })
    if (r.ok) {
      setEmail('')
      setPassword('')
      setRole('user')
      setShowForm(false)
      await load()
    } else {
      setError(await r.text())
    }
    setSaving(false)
  }

  async function handleChangeRole(userId: string, currentRole: string) {
    const newRole = currentRole === 'admin' ? 'user' : 'admin'
    const r = await fetch(`/api/comp-users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, role: newRole }),
    })
    if (r.ok) await load()
  }

  async function handleRemove(userId: string, userEmail: string | null) {
    if (!confirm(`Remove ${userEmail ?? userId} from this competition?`)) return
    const r = await fetch(`/api/comp-users/${userId}?slug=${slug}`, { method: 'DELETE' })
    if (r.ok) await load()
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Competition Users</h1>
          <p className="text-gray-400 mt-1">Admins and users with access to this competition</p>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setError('') }}
          className="bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors"
        >
          {showForm ? '− Cancel' : '+ Add User'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-gray-900 rounded-xl p-6 space-y-4 max-w-lg">
          <h2 className="text-lg font-semibold text-white">Add User</h2>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="user@example.com"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Password <span className="text-gray-500">(min 12 chars; ignored if user already exists)</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={12}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Role</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as 'admin' | 'user')}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
              >
                <option value="user">User — full access, cannot manage users</option>
                <option value="admin">Admin — full access including user management</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-lg px-4 py-2 text-sm transition-colors"
            >
              {saving ? 'Saving…' : 'Add User'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError('') }}
              className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-4 py-2 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-gray-500">No users yet.</p>
      ) : (
        <div className="max-w-2xl space-y-2">
          {users.map(u => (
            <div key={u.userId} className="flex items-center justify-between bg-gray-900 rounded-xl px-5 py-4">
              <div>
                <div className="text-white font-medium">{u.email ?? u.userId}</div>
                <div className="text-xs mt-0.5">
                  <span className={`px-2 py-0.5 rounded-full font-medium ${
                    u.role === 'admin'
                      ? 'bg-orange-900 text-orange-300'
                      : 'bg-gray-700 text-gray-300'
                  }`}>
                    {u.role === 'admin' ? 'Admin' : 'User'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleChangeRole(u.userId, u.role)}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  {u.role === 'admin' ? 'Downgrade to User' : 'Upgrade to Admin'}
                </button>
                <button
                  onClick={() => handleRemove(u.userId, u.email)}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
