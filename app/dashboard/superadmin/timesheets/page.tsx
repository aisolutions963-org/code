'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { TimesheetEntry, WorkerOption } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function EditModal({
  entry,
  onClose,
  onSaved,
}: {
  entry: TimesheetEntry
  onClose: () => void
  onSaved: () => void
}) {
  const [regularHours, setRegularHours] = useState(entry.regularHours)
  const [overtimeHours, setOvertimeHours] = useState(entry.overtimeHours)
  const [notes, setNotes] = useState(entry.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = regularHours + overtimeHours

  async function handleSave() {
    if (total > 16) { setError('Total hours cannot exceed 16.'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/timesheets/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regularHours, overtimeHours, notes: notes || undefined }),
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Edit Entry</h3>
        <p className="text-sm text-gray-500 mb-4">
          {entry.workDate} · {entry.workerName ?? entry.workerIds[0]} · {entry.projectRef ?? entry.projectIds[0]}
        </p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Regular Hours</label>
              <input
                type="number"
                min={0}
                max={24}
                step={0.5}
                value={regularHours}
                onChange={(e) => setRegularHours(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Overtime Hours</label>
              <input
                type="number"
                min={0}
                max={24}
                step={0.5}
                value={overtimeHours}
                onChange={(e) => setOvertimeHours(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
              />
            </div>
          </div>
          <div className={`text-xs font-medium ${total > 16 ? 'text-red-600' : total > 14 ? 'text-orange-600' : 'text-gray-500'}`}>
            Total: {total.toFixed(1)}h{total > 14 && total <= 16 ? ' ⚠ over 14h' : total > 16 ? ' ✕ exceeds 16h' : ''}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none resize-none"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || total > 16}
            className="flex-1 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SuperadminTimesheetsPage() {
  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [to, setTo] = useState(today)
  const [workerId, setWorkerId] = useState('')
  const [editEntry, setEditEntry] = useState<TimesheetEntry | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (workerId) params.set('workerId', workerId)

  const { data, isLoading, error, mutate } = useSWR<{ entries: TimesheetEntry[] }>(
    `/api/timesheets?${params.toString()}`,
    fetcher,
    { refreshInterval: 60000 },
  )

  const { data: workersData } = useSWR<{ workers: WorkerOption[] }>(
    '/api/timesheets/workers',
    fetcher,
    { revalidateOnFocus: false },
  )

  const entries = data?.entries ?? []
  const workers = workersData?.workers ?? []

  async function handleDelete(id: string) {
    if (!confirm('Delete this timesheet entry?')) return
    setDeletingId(id)
    try {
      await fetch(`/api/timesheets/${id}`, { method: 'DELETE' })
      mutate()
    } finally {
      setDeletingId(null)
    }
  }

  const totalRegular = entries.reduce((s, e) => s + e.regularHours, 0)
  const totalOvertime = entries.reduce((s, e) => s + e.overtimeHours, 0)
  const totalHours = entries.reduce((s, e) => s + e.totalHours, 0)

  return (
    <div className="p-6 space-y-5 min-w-0">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Production Timesheets</h2>
          <p className="text-sm text-gray-500">Daily worker time entries</p>
        </div>
        <a
          href={`/api/reports/download/timesheets?${params.toString()}`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export Excel
        </a>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Worker</label>
          <select
            value={workerId}
            onChange={(e) => setWorkerId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
          >
            <option value="">All Workers</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>{w.name}{w.nickname ? ` (${w.nickname})` : ''}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary chips */}
      {entries.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2 text-center">
            <p className="text-lg font-bold text-blue-700">{entries.length}</p>
            <p className="text-xs text-blue-500">Entries</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-center">
            <p className="text-lg font-bold text-gray-700">{totalRegular.toFixed(1)}</p>
            <p className="text-xs text-gray-500">Regular Hrs</p>
          </div>
          <div className="bg-orange-50 border border-orange-100 rounded-lg px-4 py-2 text-center">
            <p className="text-lg font-bold text-orange-700">{totalOvertime.toFixed(1)}</p>
            <p className="text-xs text-orange-500">Overtime Hrs</p>
          </div>
          <div className="bg-green-50 border border-green-100 rounded-lg px-4 py-2 text-center">
            <p className="text-lg font-bold text-green-700">{totalHours.toFixed(1)}</p>
            <p className="text-xs text-green-500">Total Hrs</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          Failed to load timesheet entries.
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <Spinner />
      ) : entries.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-400">No timesheet entries found for this period.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Worker</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Project</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Regular</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Overtime</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{e.workDate}</td>
                    <td className="px-4 py-2.5 text-gray-800 font-medium">{e.workerName ?? e.workerIds[0] ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{e.projectRef ?? e.projectIds[0] ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{e.regularHours.toFixed(1)}</td>
                    <td className="px-4 py-2.5 text-right text-orange-600">{e.overtimeHours > 0 ? e.overtimeHours.toFixed(1) : '—'}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${e.totalHours > 14 ? 'text-orange-600' : 'text-gray-900'}`}>
                      {e.totalHours.toFixed(1)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-400 max-w-xs truncate">{e.notes ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setEditEntry(e)}
                          className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(e.id)}
                          disabled={deletingId === e.id}
                          className="text-xs text-red-500 hover:text-red-600 font-medium disabled:opacity-50"
                        >
                          {deletingId === e.id ? '…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editEntry && (
        <EditModal
          entry={editEntry}
          onClose={() => setEditEntry(null)}
          onSaved={() => mutate()}
        />
      )}
    </div>
  )
}
