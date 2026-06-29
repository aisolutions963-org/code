'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput } from '@/lib/types'

interface DayRow {
  date: string
  note: string
}

function parseSchedule(raw?: string): DayRow[] {
  if (!raw) return [{ date: '', note: '' }]
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) return parsed
  } catch {}
  return [{ date: '', note: '' }]
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
    const hasRealRows = schedule.some((r) => r.date)
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 space-y-1.5" dir="rtl">
        <p className="text-xs font-semibold text-green-800">✓ تم تسجيل جدول التركيب</p>
        {hasRealRows ? (
          <div className="space-y-1">
            {schedule.filter((r) => r.date).map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-green-700">
                <span className="font-mono shrink-0">{r.date}</span>
                {r.note && <span className="text-green-600">{r.note}</span>}
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

  function updateRow(index: number, field: keyof DayRow, value: string) {
    setRows((prev) => prev.map((r, i) => i === index ? { ...r, [field]: value } : r))
  }

  function addRow() {
    setRows((prev) => [...prev, { date: '', note: '' }])
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit() {
    const validRows = rows.filter((r) => r.date.trim())
    if (validRows.length === 0) { setError('أضف يوماً واحداً على الأقل مع تاريخ'); return }
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
      <p className="text-xs font-semibold text-violet-800">أضف أيام التركيب مع ملاحظة لكل يوم</p>

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2 bg-white border border-violet-200 rounded-lg px-2 py-1.5">
            <input
              type="date"
              value={row.date}
              onChange={(e) => updateRow(i, 'date', e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
            <input
              type="text"
              value={row.note}
              onChange={(e) => updateRow(i, 'note', e.target.value)}
              placeholder="ملاحظة (اختياري)"
              className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-violet-400 text-right"
            />
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
