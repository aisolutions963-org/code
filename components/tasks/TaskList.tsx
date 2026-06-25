'use client'

import React from 'react'
import { Task, TaskUpdateInput, Role } from '@/lib/types'
import TaskCard from './TaskCard'
import GatewaySection from './GatewaySection'
import GateGroupCard from './GateGroupCard'
import ItemGroupSection from './ItemGroupSection'
import ProjectTaskCard from './ProjectTaskCard'

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
  projectId?: string,
): React.ReactNode[] {
  // Split per-item (Phase 2) tasks from project-level tasks
  const itemTasks = tasks.filter((t) => t.projectItem && t.projectItem.length > 0)
  const projectLevelTasks = tasks.filter((t) => !t.projectItem || t.projectItem.length === 0)

  // Manager-department path tasks render as standalone cards, not as gateway chips
  const isManagerOnlyPathTask = (t: Task) =>
    (t.pathCondition != null && t.pathCondition !== '') &&
    t.department != null && t.department.length > 0 &&
    t.department.every((d) => d === 'Manager' || d === 'Management' || d === 'Purchase')

  const standalonePathTasks = projectLevelTasks.filter(isManagerOnlyPathTask)
  const standalonePathIds = new Set(standalonePathTasks.map((t) => t.id))

  const pathTaskIds = new Set(
    projectLevelTasks.filter(
      (t) => t.pathCondition != null && t.pathCondition !== '' && !standalonePathIds.has(t.id),
    ).map((t) => t.id),
  )
  const allPathTasks = projectLevelTasks.filter((t) => pathTaskIds.has(t.id))

  const gateTasks = projectLevelTasks.filter((t) => isGateTask(t.taskName))
  const gateTaskIds = new Set(gateTasks.map((t) => t.id))

  const mainTasks = projectLevelTasks.filter((t) => !pathTaskIds.has(t.id) && !gateTaskIds.has(t.id) && !standalonePathIds.has(t.id))

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

  // Manager-department path tasks rendered as standalone cards (not gateway chips)
  for (const t of standalonePathTasks) {
    mainNodes.push(<TaskCard key={t.id} task={t} role={role} onUpdate={onUpdate} />)
  }

  // Group per-item tasks by item ID and render each as an ItemGroupSection
  if (itemTasks.length > 0 && projectId) {
    const itemGroups = new Map<string, { name: string; tasks: Task[] }>()
    for (const t of itemTasks) {
      const itemId = t.projectItem![0]
      const itemName = t.projectItemName ?? itemId
      if (!itemGroups.has(itemId)) itemGroups.set(itemId, { name: itemName, tasks: [] })
      itemGroups.get(itemId)!.tasks.push(t)
    }
    for (const [itemId, { name, tasks: iTasks }] of Array.from(itemGroups.entries())) {
      mainNodes.push(
        <ItemGroupSection
          key={`item-${itemId}`}
          itemId={itemId}
          itemName={name}
          projectId={projectId}
          tasks={iTasks}
          role={role}
          onUpdate={onUpdate}
        />,
      )
    }
  } else if (itemTasks.length > 0) {
    // fallback: no projectId, render flat
    for (const t of itemTasks) {
      mainNodes.push(<TaskCard key={t.id} task={t} role={role} onUpdate={onUpdate} />)
    }
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

  // Groups: map projectRef → { projectRecordId, tasks }
  const groups = new Map<string, { projectRecordId: string; tasks: Task[] }>()
  for (const task of tasks) {
    const key = task.projectRef ?? task.projectRecordId ?? task.project?.[0] ?? '—'
    if (!groups.has(key)) groups.set(key, { projectRecordId: task.projectRecordId ?? task.project?.[0] ?? '', tasks: [] })
    groups.get(key)!.tasks.push(task)
  }

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([projectKey, { projectRecordId, tasks: groupTasks }]) => {
        const isPhase2 = groupTasks.some((t) => t.projectItem && t.projectItem.length > 0)
        const itemCount = new Set(groupTasks.flatMap((t) => t.projectItem ?? [])).size
        const pendingApprovalCount = groupTasks.filter((t) => t.status === 'Pending Approval').length
        const firstTask = groupTasks[0]
        const projectStage = firstTask?.projectStage?.[0]

        return (
          <ProjectTaskCard
            key={projectKey}
            projectRef={projectKey}
            projectRecordId={projectRecordId || undefined}
            projectName={firstTask?.projectName}
            projectNickname={firstTask?.projectNickname}
            projectStage={projectStage}
            taskCount={groupTasks.length}
            itemCount={itemCount}
            pendingApprovalCount={pendingApprovalCount}
            isPhase2={isPhase2}
          />
        )
      })}
    </div>
  )
}
