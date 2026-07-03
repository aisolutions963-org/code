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
      toast.success(hasMaterial ? 'Sent to Fabrication — they have been notified' : 'Recorded: ordering material')
      await onUpdate(task.id, {})
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  async function markReceived() {
    setSaving(true)
    try {
      await onUpdate(task.id, { status: 'Completed' })
      toast.success('Sample received — task completed')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  if (task.status === 'Completed') return null

  // Already sent to fabrication — SED completes this once they receive the finished sample.
  if (task.sentToFabAt) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-3 space-y-2">
        <p className="text-xs font-semibold text-amber-800">
          Sent to Fabrication{' '}
          <span className="font-normal text-amber-700">
            on {new Date(task.sentToFabAt).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })} — fabrication has been notified.
          </span>
        </p>
        <p className="text-[11px] text-amber-600">Mark complete once you receive the finished sample.</p>
        <button
          onClick={markReceived}
          disabled={saving}
          className="w-full border border-green-400 bg-green-100 text-green-900 text-xs font-semibold px-3 py-2.5 rounded-lg hover:bg-green-200 transition-colors disabled:opacity-60"
        >
          ✓ Sample Received — Complete Task
        </button>
      </div>
    )
  }

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
