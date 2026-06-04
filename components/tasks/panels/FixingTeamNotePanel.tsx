'use client'

import { useState } from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput, InstallationLog } from '@/lib/types'

interface FixingTeamNotePanelProps {
  task: Task
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function FixingTeamNotePanel({ task, onUpdate }: FixingTeamNotePanelProps) {
  const projectRecordId = task.projectRecordId ?? task.project?.[0] ?? ''

  const { data, mutate } = useSWR<{ logs: InstallationLog[] }>(
    projectRecordId ? `/api/installation-logs?projectRecordId=${projectRecordId}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const logs = data?.logs ?? []

  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [workers, setWorkers] = useState('')
  const [adding, setAdding] = useState(false)
  const [completing, setCompleting] = useState(false)
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
      <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 space-y-1.5" dir="rtl">
        <p className="text-xs font-semibold text-green-800">✓ تم إتمام مرحلة التركيب</p>
        {logs.length > 0 && (
          <div className="space-y-1">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 text-xs text-green-700">
                <span className="font-medium shrink-0">{log.date}</span>
                {log.numberOfLaborers != null && (
                  <span className="shrink-0">{log.numberOfLaborers} عمال</span>
                )}
                {log.workDescription && (
                  <span className="text-green-600">{log.workDescription}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  async function handleAddDay() {
    if (!date) { setError('اختر تاريخاً'); return }
    if (!projectRecordId) { setError('لا يوجد مشروع مرتبط'); return }
    setError('')
    setAdding(true)
    try {
      const res = await fetch('/api/installation-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectRecordId,
          date,
          workDescription: notes.trim() || undefined,
          numberOfLaborers: workers ? parseInt(workers, 10) : undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'فشل الإضافة')
      }
      await mutate()
      setDate('')
      setNotes('')
      setWorkers('')
      toast.success('تمت إضافة اليوم')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الإضافة')
      toast.error('فشل الإضافة')
    } finally {
      setAdding(false)
    }
  }

  async function handleComplete() {
    setError('')
    setCompleting(true)
    try {
      await onUpdate(task.id, { status: 'Completed' })
      toast.success('تم إتمام مهمة التركيب')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الإتمام')
      toast.error('فشل الإتمام')
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-3 space-y-3" dir="rtl">
      <p className="text-xs font-semibold text-violet-800">سجّل أيام التركيب</p>

      {/* Add day form */}
      <div className="bg-white border border-violet-200 rounded-lg px-3 py-2.5 space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 block mb-1">التاريخ <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 text-right"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">عدد العمال</label>
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
        <div>
          <label className="text-xs text-gray-500 block mb-1">ملاحظات اليوم</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="وصف الأعمال المنجزة في هذا اليوم…"
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none text-right"
          />
        </div>
        <button
          onClick={handleAddDay}
          disabled={adding || !date}
          className="w-full py-1.5 rounded-lg text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {adding ? 'جاري الإضافة…' : '+ إضافة يوم'}
        </button>
      </div>

      {/* Logged days list */}
      {logs.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-violet-700">الأيام المسجّلة ({logs.length})</p>
          {logs.map((log) => (
            <div key={log.id} className="bg-white border border-violet-100 rounded-lg px-3 py-2 text-xs space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-800">{log.date}</span>
                {log.numberOfLaborers != null && (
                  <span className="text-gray-500">{log.numberOfLaborers} عمال</span>
                )}
              </div>
              {log.workDescription && (
                <p className="text-gray-600 leading-relaxed">{log.workDescription}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Complete task */}
      <button
        onClick={handleComplete}
        disabled={completing}
        className="w-full py-2 rounded-lg text-sm font-semibold bg-violet-700 text-white hover:bg-violet-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {completing ? 'جاري الإتمام…' : '✓ إتمام مهمة التركيب'}
      </button>
    </div>
  )
}
