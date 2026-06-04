'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput } from '@/lib/types'

interface Props {
  task: Task
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

export default function OrderSamplePanel({ task, onUpdate }: Props) {
  const [saving, setSaving] = useState(false)

  async function completeBranch(hasMaterial: boolean) {
    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}/complete-branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hasMaterial }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Failed')
      }
      toast.success(hasMaterial ? 'Branch: We have material' : 'Branch: Ordering material')
      await onUpdate(task.id, {})
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  if (task.status === 'Completed') return null

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-3 space-y-2">
      <p className="text-xs font-semibold text-green-800">
        Sample Branch{' '}
        <span className="font-normal text-green-700">— does the team have the material?</span>
      </p>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          onClick={() => completeBranch(true)}
          disabled={saving}
          className="border border-green-400 bg-green-100 text-green-900 text-xs font-semibold px-3 py-2.5 rounded-lg hover:bg-green-200 transition-colors disabled:opacity-60 text-left"
        >
          <div className="font-bold">✓ We Have It</div>
          <div className="font-normal text-green-700 mt-0.5">Send to Fabrication</div>
        </button>
        <button
          onClick={() => completeBranch(false)}
          disabled={saving}
          className="border border-orange-300 bg-orange-50 text-orange-900 text-xs font-semibold px-3 py-2.5 rounded-lg hover:bg-orange-100 transition-colors disabled:opacity-60 text-left"
        >
          <div className="font-bold">✗ Need to Order</div>
          <div className="font-normal text-orange-700 mt-0.5">Request F3 material order</div>
        </button>
      </div>
    </div>
  )
}
