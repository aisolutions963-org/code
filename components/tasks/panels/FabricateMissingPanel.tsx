'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput } from '@/lib/types'

interface Props {
  task: Task
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

export default function FabricateMissingPanel({ task, onUpdate }: Props) {
  const [saving, setSaving] = useState(false)

  async function fabricate() {
    setSaving(true)
    try {
      await onUpdate(task.id, { status: 'In Progress' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  async function skip() {
    setSaving(true)
    try {
      await onUpdate(task.id, { status: 'Completed' })
      toast.success('Skipped — no missing items')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  if (task.status === 'Completed') return null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-3 space-y-2">
      <p className="text-xs font-semibold text-amber-800">
        Missing Items Check{' '}
        <span className="font-normal text-amber-700">— are there any items that need fabrication?</span>
      </p>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          onClick={fabricate}
          disabled={saving || task.status === 'In Progress'}
          className="border border-amber-400 bg-amber-100 text-amber-900 text-xs font-semibold px-3 py-2.5 rounded-lg hover:bg-amber-200 transition-colors disabled:opacity-60 text-left"
        >
          <div className="font-bold">✓ Yes — Fabricate</div>
          <div className="font-normal text-amber-700 mt-0.5">
            {task.status === 'In Progress' ? 'In progress' : 'Start fabrication'}
          </div>
        </button>
        <button
          onClick={skip}
          disabled={saving}
          className="border border-gray-300 bg-gray-50 text-gray-800 text-xs font-semibold px-3 py-2.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-60 text-left"
        >
          <div className="font-bold">✗ No — Skip</div>
          <div className="font-normal text-gray-600 mt-0.5">No missing items, continue</div>
        </button>
      </div>
    </div>
  )
}
