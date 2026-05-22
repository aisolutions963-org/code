'use client'

import { useState } from 'react'
import { Task, TaskUpdateInput, Role } from '@/lib/types'
import ItemProgressCard, { ItemSummary } from './ItemProgressCard'
import TaskActionModal from '@/components/tasks/TaskActionModal'

interface Props {
  items: ItemSummary[]
  role: Role
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
  onMutate: () => void
}

export default function ItemBoard({ items, role, onUpdate, onMutate }: Props) {
  const [activeTask, setActiveTask] = useState<Task | null>(null)

  const handleUpdate = async (id: string, fields: Partial<TaskUpdateInput>) => {
    await onUpdate(id, fields)
    onMutate()
  }

  const complete = items.filter((i) => i.isComplete).length
  const total = items.length

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-gray-400">No items found for this project.</p>
      </div>
    )
  }

  return (
    <>
      {/* Summary bar */}
      <div className="flex items-center gap-3 mb-5">
        <span className="text-sm text-gray-500">
          <span className="font-semibold text-gray-900">{complete}</span> / {total} items complete
        </span>
        {complete === total && total > 0 && (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium border border-green-200">
            All done — ready for handover
          </span>
        )}
      </div>

      {/* Item grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map((item) => (
          <ItemProgressCard
            key={item.id}
            item={item}
            onTaskClick={setActiveTask}
          />
        ))}
      </div>

      {/* Task action modal */}
      {activeTask && (
        <TaskActionModal
          task={activeTask}
          role={role}
          onUpdate={handleUpdate}
          onClose={() => setActiveTask(null)}
        />
      )}
    </>
  )
}
