'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput } from '@/lib/types'

interface FixingTeamNotePanelProps {
  task: Task
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

export default function FixingTeamNotePanel({ task, onUpdate }: FixingTeamNotePanelProps) {
  const [days, setDays] = useState(task.teamDaysRequired ? String(task.teamDaysRequired) : '')
  const [workers, setWorkers] = useState(task.noOfLaborsPerDay ? String(task.noOfLaborsPerDay) : '')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (task.status === 'Pending Approval') {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5" dir="rtl">
        <p className="text-xs font-semibold text-amber-800">⏳ بانتظار موافقة المدير</p>
        <p className="text-xs text-amber-700 mt-1">تم إرسال المهمة للمراجعة. سيتم إتمامها بعد الموافقة.</p>
      </div>
    )
  }

  if (task.status === 'Completed') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 space-y-1" dir="rtl">
        <p className="text-xs font-semibold text-green-800">✓ تم تسجيل متطلبات التركيب</p>
        {task.teamDaysRequired != null && (
          <p className="text-xs text-green-700">الأيام المطلوبة: <span className="font-semibold">{task.teamDaysRequired} يوم</span></p>
        )}
        {task.noOfLaborsPerDay != null && (
          <p className="text-xs text-green-700">عدد العمال في اليوم: <span className="font-semibold">{task.noOfLaborsPerDay}</span></p>
        )}
      </div>
    )
  }

  async function handleSubmit() {
    const daysNum = days ? parseInt(days, 10) : null
    if (!daysNum || daysNum < 1) { setError('أدخل عدد الأيام المطلوبة'); return }
    setError('')
    setSaving(true)
    try {
      await onUpdate(task.id, {
        teamDaysRequired: daysNum,
        ...(workers ? { noOfLaborsPerDay: parseInt(workers, 10) } : {}),
        status: 'Completed',
      })
      toast.success('تم تسجيل المتطلبات')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الحفظ')
      toast.error('فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-3 space-y-3" dir="rtl">
      <p className="text-xs font-semibold text-violet-800">أدخل متطلبات التركيب</p>

      <div className="bg-white border border-violet-200 rounded-lg px-3 py-2.5 space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 block mb-1">عدد الأيام المطلوبة <span className="text-red-500">*</span></label>
            <input
              type="number"
              min={1}
              max={365}
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
              max={100}
              value={workers}
              onChange={(e) => setWorkers(e.target.value)}
              placeholder="مثال: 4"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 text-right"
            />
          </div>
        </div>

        <p className="text-[10px] text-violet-600 leading-relaxed">
          سيستخدم المدير هذه المعلومات لتحديد مواعيد التركيب في التقويم.
        </p>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={saving || !days}
        className="w-full py-2 rounded-lg text-sm font-semibold bg-violet-700 text-white hover:bg-violet-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? 'جاري الحفظ…' : '✓ إتمام مهمة التركيب'}
      </button>
    </div>
  )
}
