'use client'

import { Task, TaskUpdateInput, Role } from '@/lib/types'
import TaskCard from './TaskCard'

interface TaskListProps {
  tasks: Task[]
  role: Role
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
  groupByProject?: boolean
}

export default function TaskList({ tasks, role, onUpdate, groupByProject = true }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-16">
        <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        <p className="text-gray-500 text-sm">No tasks at the moment</p>
      </div>
    )
  }

  if (!groupByProject) {
    return (
      <div className="space-y-2">
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} role={role} onUpdate={onUpdate} />
        ))}
      </div>
    )
  }

  // Group by project ID
  const groups = new Map<string, Task[]>()
  for (const task of tasks) {
    const key = task.projectRef ?? task.project?.[0] ?? '—'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(task)
  }

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([projectKey, groupTasks]) => (
        <section key={projectKey}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider font-mono">
              {projectKey}
            </span>
            <span className="text-xs text-gray-400">
              {groupTasks.length} task{groupTasks.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2">
            {groupTasks.map((t) => (
              <TaskCard key={t.id} task={t} role={role} onUpdate={onUpdate} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
