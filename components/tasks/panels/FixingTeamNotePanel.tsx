'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput } from '@/lib/types'

interface FixingTeamNotePanelProps {
  task: Task
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

export default function FixingTeamNotePanel({ task, onUpdate }: FixingTeamNotePanelProps) {
  const [days, setDays] = useState<string>(task.teamDaysRequired != null ? String(task.teamDaysRequired) : '')
  const [workers, setWorkers] = useState<string>(task.noOfLaborsPerDay != null ? String(task.noOfLaborsPerDay) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (task.status === 'Completed') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 space-y-1" dir="rtl">
        <p className="text-xs font-semibold text-green-800">✓ تم إرسال ملاحظة فريق التركيب</p>
        {task.teamDaysRequired != null && (
          <p className="text-xs text-green-700">عدد الأيام: {task.teamDaysRequired}</p>
        )}
        {task.noOfLaborsPerDay != null && (
          <p className="text-xs text-green-700">عدد العمال في اليوم: {task.noOfLaborsPerDay}</p>
        )}
      </div>
    )
  }

  async function handleSubmit() {
    const daysNum = parseInt(days, 10)
    const workersNum = parseInt(workers, 10)
    if (!days || isNaN(daysNum) || daysNum < 1) {
      setError('أدخل عدد الأيام')
      return
    }
    if (!workers || isNaN(workersNum) || workersNum < 1) {
      setError('أدخل عدد العمال في اليوم')
      return
    }
    setError('')
    setSaving(true)
    try {
      await onUpdate(task.id, {
        teamDaysRequired: daysNum,
        noOfLaborsPerDay: workersNum,
        status: 'Completed',
      })
      toast.success('تم إرسال الملاحظة')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الحفظ')
      toast.error('فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-3 space-y-3" dir="rtl">
      <p className="text-xs font-semibold text-violet-800">ملاحظة فريق التركيب — متطلبات التسليم</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">عدد الأيام المطلوبة</label>
          <input
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            placeholder="مثال: 3"
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 text-right"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">عدد العمال في اليوم</label>
          <input
            type="number"
            min={1}
            value={workers}
            onChange={(e) => setWorkers(e.target.value)}
            placeholder="مثال: 4"
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 text-right"
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={saving || !days || !workers}
        className="w-full py-2 rounded-lg text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? 'جاري الإرسال…' : '✓ إرسال وإتمام المهمة'}
      </button>
    </div>
  )
}
