'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput } from '@/lib/types'

const INSTALL_TEAMS = ['Engr. Abdulkarim', 'Mr. Al Mahdi', 'Mr. Yahia'] as const

interface ChooseInstallTeamPanelProps {
  task: Task
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

export default function ChooseInstallTeamPanel({ task, onUpdate }: ChooseInstallTeamPanelProps) {
  const [selectedTeam, setSelectedTeam] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleComplete() {
    if (!selectedTeam) return
    setError('')
    setSaving(true)
    try {
      const projectId = task.projectRecordId ?? task.project?.[0]
      if (!projectId) throw new Error('No project linked to this task')
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedInstallationTeam: selectedTeam }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Failed to update project')
      }
      await onUpdate(task.id, { status: 'Completed' } as Partial<TaskUpdateInput>)
      toast.success(`Installation team assigned: ${selectedTeam}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
      toast.error('Failed')
    } finally {
      setSaving(false)
    }
  }

  if (task.status === 'Completed') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
        <p className="text-xs font-semibold text-green-800">Team Assigned</p>
        <p className="text-xs text-green-700 mt-0.5">Installation team has been notified.</p>
      </div>
    )
  }

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-3 space-y-2">
      <p className="text-xs font-semibold text-indigo-800">Assign Installation Team</p>
      <div className="grid grid-cols-1 gap-1.5">
        {INSTALL_TEAMS.map((team) => (
          <button
            key={team}
            type="button"
            onClick={() => setSelectedTeam(team)}
            className={`text-left px-3 py-2 rounded-lg text-xs font-medium border-2 transition-all ${
              selectedTeam === team
                ? 'border-indigo-500 bg-indigo-100 text-indigo-900'
                : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300'
            }`}
          >
            {team}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end pt-1">
        <button
          onClick={handleComplete}
          disabled={saving || !selectedTeam}
          className="px-4 py-1.5 text-xs rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? 'Assigning…' : 'Assign & Complete'}
        </button>
      </div>
    </div>
  )
}
