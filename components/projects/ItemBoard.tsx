'use client'

import { useState } from 'react'
import { Task, TaskUpdateInput, Role } from '@/lib/types'
import ItemProgressCard, { ItemSummary } from './ItemProgressCard'
import TaskList from '@/components/tasks/TaskList'

interface Props {
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

export default function ItemBoard({ items, role, onUpdate, onMutate }: Props) {
  const [selectedItem, setSelectedItem] = useState<ItemSummary | null>(null)

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

  // Level 3: item task list
  if (selectedItem) {
    const visibleTasks = selectedItem.allTasks.filter((t) => t.status !== 'Locked')
    return (
      <div>
        {/* Item header */}
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => setSelectedItem(null)}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            All items
          </button>
          <span className="text-gray-300">/</span>
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
            <span className="text-sm font-semibold text-gray-800 truncate">{selectedItem.name}</span>
          </span>
        </div>

        <TaskList
          tasks={visibleTasks}
          role={role}
          onUpdate={handleUpdate}
          groupByProject={false}
        />
      </div>
    )
  }

  // Level 2: item grid
  return (
    <>
      <SummaryStrip items={items} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map((item, idx) => (
          <ItemProgressCard
            key={item.id}
            item={item}
            index={idx}
            onSelect={() => setSelectedItem(item)}
          />
        ))}
      </div>
    </>
  )
}
