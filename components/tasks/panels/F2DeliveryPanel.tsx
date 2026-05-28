'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput } from '@/lib/types'

interface F2DeliveryPanelProps {
  task: Task
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

export default function F2DeliveryPanel({ task, onUpdate }: F2DeliveryPanelProps) {
  const [date, setDate] = useState(task.completionDate ?? '')
  const [saving, setSaving] = useState(false)

  const saved = !!task.completionDate

  async function handleSave() {
    if (!date) return
    setSaving(true)
    try {
      await onUpdate(task.id, { completionDate: date })
      toast.success('Delivery date saved to calendar')
    } catch {
      toast.error('Failed to save delivery date')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-orange-800">Delivery Date</p>
        {saved && (
          <span className="text-[10px] font-medium text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">
            On calendar
          </span>
        )}
      </div>
      {task.plannedProdStartDate && (
        <p className="text-xs text-orange-700">
          Production: {task.plannedProdStartDate}
          {task.expectedFabEndDate ? ` → ${task.expectedFabEndDate}` : ''}
        </p>
      )}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        <button
          onClick={handleSave}
          disabled={saving || !date || date === task.completionDate}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 transition-colors whitespace-nowrap"
        >
          {saving ? 'Saving…' : saved ? 'Update' : 'Set date'}
        </button>
      </div>
      <p className="text-[11px] text-orange-600/70">
        Saves to calendar as a delivery event visible to all roles.
      </p>
    </div>
  )
}
