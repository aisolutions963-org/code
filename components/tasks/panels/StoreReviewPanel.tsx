'use client'

import { useState } from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput, Material } from '@/lib/types'

interface StoreReviewPanelProps {
  task: Task
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function StoreReviewPanel({ task, onUpdate }: StoreReviewPanelProps) {
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Read-only view of the ordered materials so fabrication can base the store check
  // on the actual list the SED submitted. They can see it but not change it.
  const projectId = task.projectRecordId ?? task.project?.[0]
  const { data: matData, isLoading: matLoading } = useSWR<{ materials: Material[] }>(
    projectId ? `/api/projects/${projectId}/materials` : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const materials = (matData?.materials ?? []).filter(
    (m) => (m.orderStatus ?? '').toLowerCase().startsWith('pending'),
  )

  async function handleSubmit() {
    setError('')
    if (!notes.trim()) {
      setError('Add your review notes')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}/store-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes.trim() }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Failed')
      }
      toast.success('Store review submitted')
      await onUpdate(task.id, {})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
      toast.error('Failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-3 space-y-3">
      <p className="text-xs font-semibold text-emerald-800">
        Store Review Notes{' '}
        <span className="font-normal text-emerald-700">— what did you find in the store?</span>
      </p>

      {/* Ordered materials — read-only reference for the store check */}
      <div className="bg-white border border-emerald-200 rounded-lg overflow-hidden">
        <div className="px-3 py-1.5 bg-emerald-100/60 border-b border-emerald-200 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wide">Ordered Materials</span>
          <span className="text-[10px] text-emerald-600">view only</span>
        </div>
        {matLoading ? (
          <p className="px-3 py-2 text-xs text-gray-400">Loading materials…</p>
        ) : materials.length === 0 ? (
          <p className="px-3 py-2 text-xs text-gray-400">No pending materials found for this project.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 border-b border-emerald-100">
                  <th className="px-3 py-1.5 font-medium">Material</th>
                  <th className="px-2 py-1.5 font-medium w-14">Qty</th>
                  <th className="px-2 py-1.5 font-medium w-16">Unit</th>
                  <th className="px-2 py-1.5 font-medium">Supplier</th>
                  <th className="px-2 py-1.5 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-50">
                {materials.map((m) => (
                  <tr key={m.id} className="text-gray-700">
                    <td className="px-3 py-1.5 font-medium">{m.name}</td>
                    <td className="px-2 py-1.5">{m.quantity || '—'}</td>
                    <td className="px-2 py-1.5">{m.unit || '—'}</td>
                    <td className="px-2 py-1.5">{m.supplier || '—'}</td>
                    <td className="px-2 py-1.5 text-gray-500">{m.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder="e.g. 40% of the MDF is already in stock, remaining 60% needs ordering…"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400 resize-none"
      />

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving}
        className="w-full py-2 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 transition-colors"
      >
        {saving ? 'Submitting…' : 'Submit Store Review'}
      </button>
    </div>
  )
}
