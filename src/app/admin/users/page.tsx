'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

type User = { id: number; username: string }

export default function UsersPage() {
  const { data: session } = useSession()
  const [users, setUsers] = useState<User[]>([])

  // add user form
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  // change password state per user
  const [changingId, setChangingId] = useState<number | null>(null)
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwLoading, setPwLoading] = useState(false)

  async function load() {
    const res = await fetch('/api/users')
    if (res.ok) setUsers(await res.json())
  }

  useEffect(() => { load() }, [])

  async function addUser(e: React.FormEvent) {
    e.preventDefault()
    setAddError('')
    if (newPassword.length < 6) { setAddError('Password must be at least 6 characters'); return }
    setAddLoading(true)
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newUsername.trim(), password: newPassword }),
    })
    setAddLoading(false)
    if (res.ok) {
      setNewUsername('')
      setNewPassword('')
      await load()
    } else {
      setAddError(await res.text())
    }
  }

  function startChangePassword(userId: number) {
    setChangingId(userId)
    setNewPw('')
    setConfirmPw('')
    setPwError('')
  }

  async function savePassword(userId: number) {
    setPwError('')
    if (newPw.length < 6) { setPwError('Password must be at least 6 characters'); return }
    if (newPw !== confirmPw) { setPwError('Passwords do not match'); return }
    setPwLoading(true)
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPw }),
    })
    setPwLoading(false)
    if (res.ok) {
      setChangingId(null)
    } else {
      setPwError(await res.text())
    }
  }

  async function deleteUser(userId: number, username: string) {
    if (!confirm(`Remove user "${username}"?`)) return
    const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' })
    if (res.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== userId))
    } else {
      alert(await res.text())
    }
  }

  const currentUsername = session?.user?.name

  return (
    <div className="space-y-8 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <p className="text-gray-400 mt-1">Manage admin accounts</p>
      </div>

      {/* User list */}
      <div className="bg-gray-900 rounded-xl overflow-hidden">
        {users.map((u) => (
          <div key={u.id} className="border-b border-gray-800 last:border-0">
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="text-white font-medium">{u.username}</span>
                {u.username === currentUsername && (
                  <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">you</span>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => changingId === u.id ? setChangingId(null) : startChangePassword(u.id)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {changingId === u.id ? 'Cancel' : 'Change Password'}
                </button>
                <button
                  onClick={() => deleteUser(u.id, u.username)}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
                  disabled={users.length <= 1}
                >
                  Remove
                </button>
              </div>
            </div>

            {changingId === u.id && (
              <div className="px-5 pb-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">New Password</label>
                    <input
                      type="password"
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      autoFocus
                      className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Confirm Password</label>
                    <input
                      type="password"
                      value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') savePassword(u.id) }}
                      className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>
                {pwError && <p className="text-red-400 text-xs">{pwError}</p>}
                <button
                  onClick={() => savePassword(u.id)}
                  disabled={pwLoading}
                  className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
                >
                  {pwLoading ? 'Saving...' : 'Save Password'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add user */}
      <div className="bg-gray-900 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Add User</h2>
        <form onSubmit={addUser} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Username</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>
          </div>
          {addError && <p className="text-red-400 text-xs">{addError}</p>}
          <button
            type="submit"
            disabled={addLoading || !newUsername.trim() || !newPassword}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-lg px-5 py-2.5 text-sm transition-colors"
          >
            {addLoading ? 'Adding...' : 'Add User'}
          </button>
        </form>
      </div>
    </div>
  )
}
