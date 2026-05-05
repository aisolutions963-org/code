'use client'

import { Task, TaskUpdateInput, Role } from '@/lib/types'
import TaskCard from './TaskCard'

interface TaskGroupedListProps {
  tasks: Task[]
  role: Role
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

const PHASE4_STAGES = ['Phase 4', 'Phase 5', 'Closed', 'Warranty', 'Warranty Done']

function shouldGroup(tasks: Task[]): boolean {
  if (tasks.length === 0) return false
  const stages = tasks.flatMap((t) => t.projectStage ?? [])
  return !stages.some((s) => PHASE4_STAGES.includes(s))
}

export default function TaskGroupedList({ tasks, role, onUpdate }: TaskGroupedListProps) {
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
                General
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
