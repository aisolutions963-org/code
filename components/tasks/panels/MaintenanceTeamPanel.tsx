'use client'

import { useState } from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput } from '@/lib/types'

interface TeamMember { id: string; name: string }
const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Props {
  task: Task
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

export default function MaintenanceTeamPanel({ task, onUpdate }: Props) {
  const [date, setDate] = useState(task.taskStartDate ?? '')
  const [selected, setSelected] = useState<TeamMember | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const { data, isLoading } = useSWR<{ members: TeamMember[] }>(
    '/api/team/installation',
    fetcher,
    { revalidateOnFocus: false },
  )
  const members = data?.members ?? []

  async function handleAssign() {
    if (!selected) { toast.error('Select a team member first'); return }
    if (!date) { toast.error('Select a date first'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}/assign-maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamMemberName: selected.name, date }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Failed')
      }
      await onUpdate(task.id, {})
      setDone(true)
      toast.success(`${selected.name} notified — maintenance on ${date}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  if (done || task.status === 'In Progress' || task.status === 'Completed') {
    return (
      <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-2.5">
        <p className="text-xs font-semibold text-teal-800">Maintenance Work Scheduled</p>
        <p className="text-xs text-teal-600 mt-0.5">
          The installation team has been notified to carry out maintenance work.
          {task.taskStartDate && ` Scheduled: ${task.taskStartDate}`}
        </p>
      </div>
    )
  }

  return (
    <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-3 space-y-3">
      <p className="text-xs font-semibold text-teal-800 uppercase tracking-wide">Assign Maintenance Team</p>

      <div className="space-y-1">
        <p className="text-[11px] font-medium text-teal-700">Maintenance Date</p>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="text-sm border border-teal-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-teal-300 w-full"
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-teal-700">Installation Team Member</p>
        {isLoading && <p className="text-xs text-teal-400">Loading…</p>}
        {!isLoading && members.length === 0 && (
          <p className="text-xs text-red-500">No active installation team members found.</p>
        )}
        {!isLoading && members.length > 0 && (
          <div className="grid grid-cols-1 gap-1.5">
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelected(m)}
                className={`text-left px-3 py-2 rounded-lg text-xs font-medium border-2 transition-all ${
                  selected?.id === m.id
                    ? 'border-teal-500 bg-teal-100 text-teal-900'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-teal-300'
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end pt-1">
        <button
          onClick={handleAssign}
          disabled={saving || !selected || !date || isLoading}
          className="px-4 py-1.5 text-xs rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 disabled:opacity-60"
        >
          {saving ? 'Assigning…' : 'Assign & Notify'}
        </button>
      </div>
    </div>
  )
}
