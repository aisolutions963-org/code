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
}

function isGatewayTask(name: string) {
  return name.toLowerCase().includes('[gateway]')
}
function isGateTask(name: string) {
  // [GATE] but NOT [GATEWAY]
  return /\[gate\]/i.test(name) && !/\[gateway\]/i.test(name)
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

  // Non-path, non-gate tasks in sorted order
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

  // If path tasks exist but the gateway task was Locked (filtered out), still show the section
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
        {renderTasksInOrder(tasks, role, onUpdate)}
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
            {renderTasksInOrder(groupTasks, role, onUpdate)}
          </div>
        </section>
      ))}
    </div>
  )
}
