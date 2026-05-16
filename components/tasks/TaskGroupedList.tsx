'use client'

import { Task, TaskUpdateInput, Role } from '@/lib/types'
import TaskCard from './TaskCard'
import { TaskListSkeleton } from './TaskList'

interface TaskGroupedListProps {
  tasks: Task[]
  role: Role
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
  loading?: boolean
}

const PHASE4_STAGES = ['Phase 4', 'Phase 5', 'Closed', 'Warranty', 'Warranty Done']

function shouldGroup(tasks: Task[]): boolean {
  if (tasks.length === 0) return false
  const stages = tasks.flatMap((t) => t.projectStage ?? [])
  return !stages.some((s) => PHASE4_STAGES.includes(s))
}

export default function TaskGroupedList({ tasks, role, onUpdate, loading }: TaskGroupedListProps) {
  if (loading) return <TaskListSkeleton />

  if (tasks.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-14 h-14 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center mx-auto mb-3">
          <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        </div>
        <p className="text-gray-700 text-sm font-medium">{role === 'installation' || role === 'fabrication' ? 'تم الإنجاز' : 'All caught up'}</p>
        <p className="text-gray-400 text-xs mt-1">{role === 'installation' || role === 'fabrication' ? 'لا توجد مهام حالياً' : 'No tasks match this view'}</p>
      </div>
    )
  }

  if (!shouldGroup(tasks)) {
    return (
      <div className="space-y-3">
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} role={role} onUpdate={onUpdate} />
        ))}
      </div>
    )
  }

  // Group by project item
  const groups = new Map<string, { label: string; tasks: Task[] }>()
  const ungrouped: Task[] = []

  for (const task of tasks) {
    const itemId = task.projectItem?.[0]
    if (!itemId) {
      ungrouped.push(task)
      continue
    }
    if (!groups.has(itemId)) {
      groups.set(itemId, {
        label: task.projectItemName ?? itemId,
        tasks: [],
      })
    }
    groups.get(itemId)!.tasks.push(task)
  }

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([itemId, group]) => (
        <div key={itemId}>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 shrink-0">
              {group.label}
            </span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
          <div className="space-y-3">
            {group.tasks.map((t: Task) => (
              <TaskCard key={t.id} task={t} role={role} onUpdate={onUpdate} />
            ))}
          </div>
        </div>
      ))}
      {ungrouped.length > 0 && (
        <div>
          {groups.size > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 shrink-0">
                {role === 'installation' || role === 'fabrication' ? 'عام' : 'General'}
              </span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>
          )}
          <div className="space-y-3">
            {ungrouped.map((t) => (
              <TaskCard key={t.id} task={t} role={role} onUpdate={onUpdate} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
