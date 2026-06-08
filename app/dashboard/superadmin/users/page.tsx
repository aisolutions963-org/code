'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

interface User {
  id: number
  name: string
  email: string
  role: string
  active: number
  airtable_member_id: string | null
  created_at: string
  updated_at: string
}

const ROLES = ['superadmin', 'manager', 'sed', 'fabrication', 'installation']
const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Superadmin',
  manager: 'Manager',
  sed: 'SED',
  fabrication: 'Fabrication',
  installation: 'Installation',
}

import toast from 'react-hot-toast'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface UserFormState {
  name: string
  email: string
  password: string
  role: string
  airtable_member_id: string
}

const emptyForm: UserFormState = { name: '', email: '', password: '', role: 'manager', airtable_member_id: '' }

function EmailSettingsCard() {
  const { data, mutate } = useSWR<{ accountantEmail: string }>('/api/settings', fetcher)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  function startEdit() {
    setValue(data?.accountantEmail ?? '')
    setEditing(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountantEmail: value }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed')
      }
      await mutate()
      setEditing(false)
      toast.success('Accountant email updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-5 py-4 mb-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Accountant Email</p>
          <p className="text-sm text-gray-500 leading-snug">Payment notifications are sent to this address.</p>
        </div>
        {editing ? (
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="email"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-64"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false) }}
            />
            <button
              onClick={handleSave}
              disabled={saving || !value.includes('@')}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-xs px-2 py-1.5 text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-sm font-mono text-gray-800">{data?.accountantEmail ?? '—'}</span>
            <button
              onClick={startEdit}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              Edit
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function UsersPage() {
  const { data, error, isLoading, mutate } = useSWR<{ users: User[] }>(
    '/api/users',
    fetcher,
    { refreshInterval: 300_000 },
  )

  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [form, setForm] = useState<UserFormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [confirmDeactivate, setConfirmDeactivate] = useState<User | null>(null)
  const [deactivating, setDeactivating] = useState(false)

  const users = data?.users ?? []

  function openAdd() {
    setEditingUser(null)
    setForm(emptyForm)
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(user: User) {
    setEditingUser(user)
    setForm({ name: user.name, email: user.email, password: '', role: user.role, airtable_member_id: user.airtable_member_id ?? '' })
    setFormError('')
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.name || !form.email || (!editingUser && !form.password)) {
      setFormError('Name, email, and password are required')
      return
    }
    if (form.password && form.password.length < 8) {
      setFormError('Password must be at least 8 characters')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const body: Record<string, string> = { name: form.name, email: form.email, role: form.role }
      if (form.password) body.password = form.password
      if (form.airtable_member_id.trim()) body.airtable_member_id = form.airtable_member_id.trim()

      const res = editingUser
        ? await fetch(`/api/users/${editingUser.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })

      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Save failed')
      }
      mutate()
      setModalOpen(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(user: User) {
    setDeactivating(true)
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed to deactivate')
      }
      mutate()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to deactivate')
    } finally {
      setDeactivating(false)
      setConfirmDeactivate(null)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage system access and roles</p>
        </div>
        <Button onClick={openAdd}>Add User</Button>
      </div>

      <EmailSettingsCard />

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          Failed to load users. <button onClick={() => mutate()} className="underline">Retry</button>
        </div>
      )}

      {!isLoading && !error && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{user.name}</td>
                  <td className="px-4 py-3 text-gray-600">{user.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant="gray">{ROLE_LABELS[user.role] ?? user.role}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={user.active ? 'green' : 'gray'}>
                      {user.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(user)}
                        className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                      >
                        Edit
                      </button>
                      {user.active ? (
                        <button
                          onClick={() => setConfirmDeactivate(user)}
                          className="text-xs text-red-500 hover:text-red-600 font-medium"
                        >
                          Deactivate
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingUser ? 'Edit User' : 'Add User'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>Save</Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          {formError && <p className="text-red-600 text-xs">{formError}</p>}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input
              type="email"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Password {editingUser && <span className="text-gray-400">(leave blank to keep current)</span>}
            </label>
            <input
              type="password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder={editingUser ? 'New password (optional)' : 'Min. 8 characters'}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Airtable Member ID <span className="text-gray-400">(optional — links to existing record)</span>
            </label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
              value={form.airtable_member_id}
              onChange={(e) => setForm((f) => ({ ...f, airtable_member_id: e.target.value }))}
              placeholder="recXXXXXXXXXXXXXX"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* Deactivate confirmation */}
      <Modal
        open={!!confirmDeactivate}
        onClose={() => setConfirmDeactivate(null)}
        title="Deactivate User"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDeactivate(null)}>Cancel</Button>
            <Button
              onClick={() => confirmDeactivate && handleDeactivate(confirmDeactivate)}
              loading={deactivating}
            >
              Deactivate
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-700">
          Deactivate <strong>{confirmDeactivate?.name}</strong>? They will lose dashboard access.
          Their task history is preserved.
        </p>
      </Modal>
    </div>
  )
}
