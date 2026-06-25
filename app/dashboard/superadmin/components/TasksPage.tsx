'use client'

import useSWR from 'swr'
import { Task, TaskUpdateInput } from '@/lib/types'
import TaskList from '@/components/tasks/TaskList'
import { fetcher, Spinner } from './shared'
import FollowUpDecisionPanel from './FollowUpDecisionPanel'

export default function MyTasksPage() {
  const { data, error, isLoading, mutate } = useSWR<{ tasks: Task[] }>(
    '/api/tasks',
    fetcher,
    { refreshInterval: 300_000 },
  )
  const allTasks = data?.tasks ?? []

  // Superadmin sees: tasks pending their approval, Call the Client decisions, Follow Up decisions,
  // and any task explicitly assigned to the Superadmin department (e.g. payment/account tasks).
  const tasks = allTasks.filter(
    (t) =>
      t.status === 'Pending Approval' ||
      t.taskName.toLowerCase().includes('call the client') ||
      t.taskName === 'Follow Up' ||
      (t.department.includes('Superadmin') && (t.status === 'To Do' || t.status === 'In Progress')),
  )

  const callClientReady = allTasks.filter(
    (t) => t.taskName.toLowerCase().startsWith('call the client') && t.status === 'To Do',
  )

  const followUpTasks = tasks.filter(
    (t) => t.taskName === 'Follow Up' && t.status === 'To Do',
  )

  const regularTasks = tasks.filter(
    (t) => !(t.taskName === 'Follow Up' && t.status === 'To Do'),
  )

  async function handleUpdate(id: string, fields: Partial<TaskUpdateInput>) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })
    if (!res.ok) {
      const body = await res.json()
      throw new Error(body.error ?? 'Failed')
    }
    mutate()
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">My Tasks</h2>
        <p className="text-sm text-gray-500">Decisions and approvals requiring your attention</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          Failed to load tasks. <button onClick={() => mutate()} className="underline">Retry</button>
        </div>
      )}

      {/* Call-client banner */}
      {callClientReady.length > 0 && (
        <div className="bg-teal-50 border-2 border-teal-400 rounded-xl px-4 py-4">
          <div className="flex items-center gap-2.5 mb-2">
            <svg className="w-5 h-5 text-teal-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <p className="text-sm font-bold text-teal-800">
              {callClientReady.length} project{callClientReady.length > 1 ? 's' : ''} ready — call client for final confirmation
            </p>
          </div>
          <ul className="space-y-1.5 ml-7">
            {callClientReady.map((t) => (
              <li key={t.id} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0 mt-1.5" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-xs font-mono text-teal-700 font-semibold">{t.projectRef ?? ''}</span>
                    <span className="text-xs text-teal-800">{t.projectName}</span>
                  </div>
                  {t.clientPhone && (
                    <a href={`tel:${t.clientPhone}`} className="text-xs font-semibold text-teal-700 hover:text-teal-900 underline underline-offset-2">
                      {t.clientPhone}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Inactivity Follow Up panels */}
      {followUpTasks.map((t) => (
        <FollowUpDecisionPanel key={t.id} task={t} onDone={mutate} />
      ))}

      <TaskList loading={isLoading} tasks={regularTasks} role="superadmin" onUpdate={handleUpdate} />
    </div>
  )
}
