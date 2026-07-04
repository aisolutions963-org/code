'use client'

import { Task, TaskUpdateInput, Role } from '@/lib/types'
import { ItemSummary } from './ItemProgressCard'
import ItemGroupSection from '@/components/tasks/ItemGroupSection'
import { PHASE_CONFIG } from '@/lib/phases'

interface Props {
  projectId: string
  items: ItemSummary[]
  role: Role
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
  onMutate: () => void
}

function SummaryStrip({ items }: { items: ItemSummary[] }) {
  const done = items.filter((i) => i.isComplete).length
  const active = items.filter((i) => !i.isComplete && i.activeTasks.length > 0).length
  const waiting = items.filter((i) => !i.isComplete && i.activeTasks.length === 0).length
  const total = items.length

  if (done === total && total > 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 border border-green-200 rounded-xl mb-5">
        <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        <span className="text-sm font-medium text-green-800">
          All {total} items complete — project ready for handover
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap mb-5">
      {active > 0 && (
        <span className="flex items-center gap-1.5 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-full">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500" />
          </span>
          {active} active
        </span>
      )}
      {done > 0 && (
        <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          {done} done
        </span>
      )}
      {waiting > 0 && (
        <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-full">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {waiting} waiting
        </span>
      )}
      <span className="text-xs text-gray-400 ml-1">{total} items total</span>
    </div>
  )
}

export default function ItemBoard({ projectId, items, role, onUpdate, onMutate }: Props) {
  const handleUpdate = async (id: string, fields: Partial<TaskUpdateInput>) => {
    await onUpdate(id, fields)
    onMutate()
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-gray-400">No items found for this project.</p>
      </div>
    )
  }

  return (
    <>
      <SummaryStrip items={items} />

      <div className="space-y-4">
        {items.map((item) => {
          const phase2Min = PHASE_CONFIG.Open.perItemOrderMin        // 23
      const phase3Min = PHASE_CONFIG.Working.perItemOrderMin     // 30
      const hasPhase3 = item.allTasks.some(
        (t) => (t.templateOrder?.[0] ?? 0) >= phase3Min,
      )
      const visibleTasks = item.allTasks.filter((t) => {
        if (t.status === 'Locked') return false
        if (!hasPhase3) return true
        const order = t.templateOrder?.[0]
        if (order === undefined) return true
        // In phase 3+: hide completed phase-2 tasks to reduce clutter, but keep active ones visible
        if (order >= phase2Min && order < phase3Min) return t.status !== 'Completed'
        return order < phase2Min || order >= phase3Min
      })
          return (
            <ItemGroupSection
              key={item.id}
              itemId={item.id}
              itemName={item.name}
              projectId={projectId}
              tasks={visibleTasks}
              role={role}
              onUpdate={handleUpdate}
              onMutate={onMutate}
            />
          )
        })}
      </div>
    </>
  )
}
