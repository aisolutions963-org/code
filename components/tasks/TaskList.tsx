'use client'

import React from 'react'
import { Task, TaskUpdateInput, Role } from '@/lib/types'
import TaskCard from './TaskCard'
import GatewaySection from './GatewaySection'
import GateGroupCard from './GateGroupCard'

interface TaskListProps {
  tasks: Task[]
  role: Role
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
  groupByProject?: boolean
  loading?: boolean
}

function isGatewayTask(name: string) {
  return name.toLowerCase().includes('[gateway]')
}
function isGateTask(name: string) {
  return /\[gate\]/i.test(name) && !/\[gateway\]/i.test(name)
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden border-l-4 border-l-gray-100">
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-100 rounded animate-pulse w-3/5" />
          <div className="flex items-center gap-2">
            <div className="h-3 bg-gray-100 rounded animate-pulse w-20" />
            <div className="h-5 bg-gray-100 rounded-full animate-pulse w-16" />
          </div>
        </div>
        <div className="w-4 h-4 bg-gray-100 rounded animate-pulse shrink-0 mt-0.5" />
      </div>
    </div>
  )
}

export function TaskListSkeleton() {
  return (
    <div className="space-y-6">
      {[3, 2].map((count, gi) => (
        <section key={gi}>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-3 bg-gray-100 rounded animate-pulse w-24" />
            <div className="h-3 bg-gray-100 rounded animate-pulse w-12" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </section>
      ))}
    </div>
  )
}

function renderTasksInOrder(
  tasks: Task[],
  role: Role,
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>,
): React.ReactNode[] {
  const pathTaskIds = new Set(
    tasks.filter((t) => t.pathCondition != null && t.pathCondition !== '').map((t) => t.id),
  )
  const allPathTasks = tasks.filter((t) => pathTaskIds.has(t.id))

  const gateTasks = tasks.filter((t) => isGateTask(t.taskName))
  const gateTaskIds = new Set(gateTasks.map((t) => t.id))

  const mainTasks = tasks.filter((t) => !pathTaskIds.has(t.id) && !gateTaskIds.has(t.id))

  let gatewayRendered = false
  const mainNodes: React.ReactNode[] = mainTasks.map((task) => {
    if (isGatewayTask(task.taskName)) {
      gatewayRendered = true
      return (
        <GatewaySection
          key={task.id}
          gateway={task}
          pathTasks={allPathTasks}
          role={role}
          onUpdate={onUpdate}
        />
      )
    }
    return <TaskCard key={task.id} task={task} role={role} onUpdate={onUpdate} />
  })

  if (allPathTasks.length > 0 && !gatewayRendered) {
    mainNodes.push(
      <GatewaySection
        key="gateway-stub"
        pathTasks={allPathTasks}
        role={role}
        onUpdate={onUpdate}
      />,
    )
  }

  if (gateTasks.length > 0) {
    mainNodes.push(
      <GateGroupCard key="gate-group" tasks={gateTasks} role={role} onUpdate={onUpdate} />,
    )
  }

  return mainNodes
}

export default function TaskList({ tasks, role, onUpdate, groupByProject = true, loading }: TaskListProps) {
  if (loading) {
    return <TaskListSkeleton />
  }

  if (tasks.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-14 h-14 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center mx-auto mb-3">
          <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        </div>
        <p className="text-gray-700 text-sm font-medium">All caught up</p>
        <p className="text-gray-400 text-xs mt-1">No tasks match this view</p>
      </div>
    )
  }

  if (!groupByProject) {
    return (
      <div className="space-y-2">
        {renderTasksInOrder(tasks, role, onUpdate)}
      </div>
    )
  }

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
            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
              {groupTasks.length}
            </span>
          </div>
          <div className="space-y-2">
            {renderTasksInOrder(groupTasks, role, onUpdate)}
          </div>
        </section>
      ))}
    </div>
  )
}
