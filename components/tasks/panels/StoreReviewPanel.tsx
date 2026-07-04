'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput } from '@/lib/types'

interface StoreReviewPanelProps {
  task: Task
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

export default function StoreReviewPanel({ task, onUpdate }: StoreReviewPanelProps) {
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
