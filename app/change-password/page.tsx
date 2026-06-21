'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const ROLE_TO_DASHBOARD: Record<string, string> = {
  superadmin: 'superadmin',
  manager: 'mgr',
  sed: 'sed',
  fabrication: 'fab',
  installation: 'fix',
}

function ChangePasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tempToken = searchParams.get('t') ?? ''

  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (newPassword !== confirm) { setError('Passwords do not match'); return }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to change password'); return }
      router.push(`/dashboard/${ROLE_TO_DASHBOARD[data.user?.role] ?? 'sed'}`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  if (!tempToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-red-600 text-sm">Invalid or missing token. Please log in again.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-sm">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Set Your Password</h1>
        <p className="text-sm text-gray-500 mb-6">
          Your account requires a password change before you can continue.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="At least 8 characters"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Confirm Password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Repeat new password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {loading ? 'Saving…' : 'Set Password & Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" /></div>}>
      <ChangePasswordForm />
    </Suspense>
  )
}
