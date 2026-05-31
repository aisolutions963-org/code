'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput } from '@/lib/types'

interface Props {
  task: Task
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

export default function F2ProductionPanel({ task, onUpdate }: Props) {
  const [startDate, setStartDate] = useState(task.plannedProdStartDate ?? '')
  const [endDate, setEndDate] = useState(task.expectedFabEndDate ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!startDate || !endDate) return
    setSaving(true)
    try {
      await onUpdate(task.id, {
        plannedProdStartDate: startDate,
        expectedFabEndDate: endDate,
        status: 'Completed',
      })
      toast.success('تم حفظ جدول الإنتاج')
    } catch {
      toast.error('فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  if (task.status === 'Completed') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5" dir="rtl">
        <p className="text-xs font-semibold text-green-800 mb-1">✓ تم تسجيل جدول الإنتاج</p>
        {task.plannedProdStartDate && (
          <p className="text-xs text-green-700">بداية التصنيع: {task.plannedProdStartDate}</p>
        )}
        {task.expectedFabEndDate && (
          <p className="text-xs text-green-700">يوم التسليم: {task.expectedFabEndDate}</p>
        )}
      </div>
    )
  }

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-3 space-y-3" dir="rtl">
      <p className="text-xs font-semibold text-orange-800">جدول الإنتاج — حدّد الفترة الزمنية لهذه القطعة</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">بداية التصنيع</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">يوم التسليم (آخر يوم)</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
      </div>
      <button
        onClick={save}
        disabled={!startDate || !endDate || saving}
        className="w-full py-2 rounded-lg text-sm font-semibold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? 'جاري الحفظ…' : '✓ حفظ وإكمال'}
      </button>
    </div>
  )
}
