'use client'

import { useState } from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput, InstallationLog } from '@/lib/types'
import { todayUAE } from '@/lib/dateUtils'

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const inp = 'w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'

interface Props {
  task: Task
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

// Dedicated installation team's day-by-day report. No team picker — the task already
// belongs to the project's assigned team. They add a day (date, workers, notes) as they go.
export default function InstallationDayPanel({ task, onUpdate }: Props) {
  const projectId = task.projectRecordId
  const { data, mutate } = useSWR<{ logs: InstallationLog[] }>(
    projectId ? `/api/projects/${projectId}/installation-logs` : null,
    fetcher,
  )
  const logs = (data?.logs ?? []).slice().sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

  const [showForm, setShowForm] = useState(false)
  const [date, setDate] = useState(() => todayUAE())
  const [workers, setWorkers] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)

  const isCompleted = task.status === 'Completed'

  async function addDay() {
    if (!date) { toast.error('Date is required'); return }
    setSaving(true)
    try {
      const body: Record<string, unknown> = { date }
      if (workers) body.numberOfLaborers = parseInt(workers)
      if (notes.trim()) body.workDescription = notes.trim()
      const res = await fetch(`/api/projects/${projectId}/installation-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error((d as { error?: string }).error ?? 'Failed') }
      toast.success('Day logged')
      setDate(todayUAE()); setWorkers(''); setNotes(''); setShowForm(false)
      mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to log day')
    } finally {
      setSaving(false)
    }
  }

  async function markComplete() {
    setCompleting(true)
    try {
      await onUpdate(task.id, { status: 'Completed' })
      toast.success('Installation marked complete')
    } catch {
      toast.error('Failed to complete')
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-blue-800">
          Installation Days{logs.length > 0 ? ` (${logs.length})` : ''}
        </p>
        {isCompleted && (
          <span className="text-[10px] font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded">Completed</span>
        )}
      </div>

      {/* Logged days */}
      {logs.length > 0 && (
        <div className="space-y-1.5">
          {logs.map((l, i) => (
            <div key={l.id} className="bg-white border border-blue-100 rounded-lg px-2.5 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-gray-700">Day {i + 1} · {l.date}</span>
                {l.numberOfLaborers != null && (
                  <span className="text-gray-500 shrink-0">{l.numberOfLaborers} worker{l.numberOfLaborers !== 1 ? 's' : ''}</span>
                )}
              </div>
              {l.workDescription && <p className="text-gray-500 mt-0.5 whitespace-pre-line">{l.workDescription}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Add-day form — available in every status so the team keeps reporting as they go */}
      {showForm ? (
        <div className="space-y-2 bg-white border border-blue-100 rounded-lg p-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Date *</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">No. of workers</label>
              <input type="number" min="1" max="100" value={workers} onChange={(e) => setWorkers(e.target.value)} className={inp} placeholder="0" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Notes</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inp} resize-none`} placeholder="What was done on site today…" />
          </div>
          <div className="flex gap-2">
            <button
              onClick={addDay}
              disabled={saving || !date}
              className="flex-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving…' : 'Save day'}
            </button>
            <button onClick={() => setShowForm(false)} className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
          + Add day
        </button>
      )}

      {/* Mark complete — once at least one day is logged; can still add days afterwards */}
      {!isCompleted && logs.length > 0 && (
        <button
          onClick={markComplete}
          disabled={completing}
          className="w-full border border-green-400 bg-green-100 text-green-900 text-xs font-semibold px-3 py-2 rounded-lg hover:bg-green-200 disabled:opacity-60 transition-colors"
        >
          {completing ? '…' : '✓ Mark installation complete'}
        </button>
      )}
    </div>
  )
}
