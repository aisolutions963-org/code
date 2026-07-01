'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput } from '@/lib/types'

interface DayRow {
  workers: string
}

function parseSchedule(raw?: string): DayRow[] {
  if (!raw) return [{ workers: '' }]
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Support old format { date, note } and new format { workers }
      if ('workers' in parsed[0]) return parsed as DayRow[]
      // Migrate old format: each old row becomes a workers row (drop date/note)
      return parsed.map(() => ({ workers: '' }))
    }
  } catch {}
  return [{ workers: '' }]
}

interface FixingTeamNotePanelProps {
  task: Task
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

export default function FixingTeamNotePanel({ task, onUpdate }: FixingTeamNotePanelProps) {
  const [rows, setRows] = useState<DayRow[]>(() => parseSchedule(task.installationSchedule))
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
    const schedule = parseSchedule(task.installationSchedule)
    const hasRealRows = schedule.some((r) => r.workers && parseInt(r.workers, 10) > 0)
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 space-y-1.5" dir="rtl">
        <p className="text-xs font-semibold text-green-800">✓ تم تسجيل جدول التركيب</p>
        {hasRealRows ? (
          <div className="space-y-1">
            {schedule.map((r, i) => (
              <div key={i} className="flex items-center gap-3 text-xs text-green-700">
                <span className="font-semibold shrink-0">اليوم {i + 1}</span>
                <span>{r.workers} عامل</span>
              </div>
            ))}
          </div>
        ) : (
          task.teamDaysRequired != null && (
            <p className="text-xs text-green-700">الأيام المطلوبة: <span className="font-semibold">{task.teamDaysRequired} يوم</span></p>
          )
        )}
      </div>
    )
  }

  function updateWorkers(index: number, value: string) {
    setRows((prev) => prev.map((r, i) => i === index ? { workers: value } : r))
  }

  function addRow() {
    setRows((prev) => [...prev, { workers: '' }])
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit() {
    const validRows = rows.filter((r) => r.workers.trim() && parseInt(r.workers, 10) > 0)
    if (validRows.length === 0) { setError('أضف يوماً واحداً على الأقل مع عدد العمال'); return }
    setError('')
    setSaving(true)
    try {
      await onUpdate(task.id, {
        installationSchedule: JSON.stringify(validRows),
        teamDaysRequired: validRows.length,
        status: 'Completed',
      })
      toast.success('تم تسجيل جدول التركيب')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الحفظ')
      toast.error('فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-3 space-y-3" dir="rtl">
      <p className="text-xs font-semibold text-violet-800">أضف عدد الأيام والعمال المطلوبين للتسليم</p>

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-3 bg-white border border-violet-200 rounded-lg px-3 py-2">
            <span className="text-xs font-semibold text-violet-700 shrink-0 w-14">اليوم {i + 1}</span>
            <div className="flex items-center gap-2 flex-1">
              <input
                type="number"
                min="1"
                value={row.workers}
                onChange={(e) => updateWorkers(i, e.target.value)}
                placeholder="0"
                className="w-20 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-violet-400 text-center"
              />
              <span className="text-xs text-gray-500">عامل</span>
            </div>
            {rows.length > 1 && (
              <button
                onClick={() => removeRow(i)}
                className="text-red-400 hover:text-red-600 text-sm leading-none shrink-0"
                aria-label="حذف"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="text-xs text-violet-700 hover:text-violet-900 font-medium"
      >
        + إضافة يوم
      </button>

      <p className="text-[10px] text-violet-600">
        سيستخدم المدير هذا الجدول لتحديد مواعيد التركيب. عدد الأيام يُحسب تلقائياً من عدد الصفوف.
      </p>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={saving}
        className="w-full py-2 rounded-lg text-sm font-semibold bg-violet-700 text-white hover:bg-violet-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? 'جاري الحفظ…' : '✓ إتمام مهمة التركيب'}
      </button>
    </div>
  )
}
