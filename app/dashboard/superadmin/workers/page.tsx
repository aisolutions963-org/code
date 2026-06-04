'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { WorkerOption } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const ROLE_OPTIONS = [
  'Fabrication',
  'Installation',
  'Fabrication & Installation',
  'Driver / Logistics',
]

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

interface WorkerFormData {
  name: string
  fullName: string
  nickname: string
  role: string
  active: boolean
}

const EMPTY_FORM: WorkerFormData = { name: '', fullName: '', nickname: '', role: '', active: true }

function WorkerModal({
  worker,
  onClose,
  onSaved,
}: {
  worker?: WorkerOption
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!worker
  const [form, setForm] = useState<WorkerFormData>(
    worker
      ? {
          name: worker.name,
          fullName: worker.fullName ?? '',
          nickname: worker.nickname ?? '',
          role: worker.role ?? '',
          active: worker.active ?? true,
        }
      : EMPTY_FORM,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: keyof WorkerFormData, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: form.name.trim(),
        fullName: form.fullName.trim() || undefined,
        nickname: form.nickname.trim() || undefined,
        role: form.role || undefined,
        active: form.active,
      }
      const res = await fetch(isEdit ? `/api/workers/${worker!.id}` : '/api/workers', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? 'Failed') }
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-5">
          {isEdit ? 'Edit Worker' : 'Add Worker'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Name <span className="text-red-500">*</span>
                <span className="ml-1 text-gray-400 font-normal">(short, used in dropdowns)</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. Ahmed"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
              <input
                type="text"
                value={form.fullName}
                onChange={(e) => set('fullName', e.target.value)}
                placeholder="e.g. Ahmed Al Mansouri"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nickname</label>
              <input
                type="text"
                value={form.nickname}
                onChange={(e) => set('nickname', e.target.value)}
                placeholder="e.g. Big Ahmed"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
              <select
                value={form.role}
                onChange={(e) => set('role', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none bg-white"
              >
                <option value="">— select role —</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => set('active', e.target.checked)}
                  className="w-4 h-4 rounded accent-brand-500"
                />
                <span className="text-sm text-gray-700">Active</span>
              </label>
            </div>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Worker'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function WorkersPage() {
  const { data, isLoading, error, mutate } = useSWR<{ workers: WorkerOption[] }>(
    '/api/workers',
    fetcher,
    { revalidateOnFocus: false },
  )

  const [showAdd, setShowAdd] = useState(false)
  const [editWorker, setEditWorker] = useState<WorkerOption | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')
  const [search, setSearch] = useState('')

  const workers = data?.workers ?? []

  const filtered = workers.filter((w) => {
    if (filterActive === 'active' && !w.active) return false
    if (filterActive === 'inactive' && w.active) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        w.name.toLowerCase().includes(q) ||
        w.fullName?.toLowerCase().includes(q) ||
        w.nickname?.toLowerCase().includes(q) ||
        w.role?.toLowerCase().includes(q)
      )
    }
    return true
  })

  async function handleToggleActive(worker: WorkerOption) {
    try {
      await fetch(`/api/workers/${worker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !worker.active }),
      })
      mutate()
    } catch {}
  }

  async function handleDelete(id: string) {
    if (!confirm('Permanently delete this worker? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await fetch(`/api/workers/${id}`, { method: 'DELETE' })
      mutate()
    } finally {
      setDeletingId(null)
    }
  }

  const activeCount = workers.filter((w) => w.active).length
  const inactiveCount = workers.filter((w) => !w.active).length

  return (
    <div className="p-6 space-y-5 min-w-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Workers</h2>
          <p className="text-sm text-gray-500">Manage daily worker roster for timesheets</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Worker
        </button>
      </div>

      {/* Stats */}
      <div className="flex gap-3 flex-wrap">
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 text-center shadow-sm">
          <p className="text-xl font-bold text-gray-800">{workers.length}</p>
          <p className="text-xs text-gray-500">Total</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-lg px-4 py-2 text-center">
          <p className="text-xl font-bold text-green-700">{activeCount}</p>
          <p className="text-xs text-green-500">Active</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-center">
          <p className="text-xl font-bold text-gray-500">{inactiveCount}</p>
          <p className="text-xs text-gray-400">Inactive</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, nickname, role…"
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none w-56"
        />
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {(['all', 'active', 'inactive'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterActive(f)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all capitalize ${
                filterActive === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          Failed to load workers.
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-sm text-gray-400">
            {workers.length === 0 ? 'No workers yet. Add your first worker.' : 'No workers match the filter.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Full Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Nickname</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((w) => (
                <tr key={w.id} className={`hover:bg-gray-50 transition-colors ${!w.active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{w.name}</td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{w.fullName ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">{w.nickname ?? '—'}</td>
                  <td className="px-4 py-3">
                    {w.role ? (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{w.role}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggleActive(w)}
                      title={w.active ? 'Click to deactivate' : 'Click to activate'}
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full transition-colors cursor-pointer ${
                        w.active
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${w.active ? 'bg-green-500' : 'bg-gray-400'}`} />
                      {w.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 justify-end">
                      <button
                        onClick={() => setEditWorker(w)}
                        className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(w.id)}
                        disabled={deletingId === w.id}
                        className="text-xs text-red-500 hover:text-red-600 font-medium disabled:opacity-50"
                      >
                        {deletingId === w.id ? '…' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <WorkerModal
          onClose={() => setShowAdd(false)}
          onSaved={() => mutate()}
        />
      )}
      {editWorker && (
        <WorkerModal
          worker={editWorker}
          onClose={() => setEditWorker(null)}
          onSaved={() => mutate()}
        />
      )}
    </div>
  )
}
