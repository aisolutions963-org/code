'use client'

import { useEffect } from 'react'
import { Task, TaskUpdateInput, Role } from '@/lib/types'
import TaskCard from './TaskCard'

interface TaskActionModalProps {
  task: Task
  role: Role
  itemName?: string
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
  onClose: () => void
}

export default function TaskActionModal({ task, role, itemName, onUpdate, onClose }: TaskActionModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative w-full sm:max-w-2xl sm:mx-4 bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
          {/* Item breadcrumb */}
          {itemName && (
            <div className="flex items-center gap-1.5 px-4 pt-3 pb-0">
              <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
              <span className="text-xs font-medium text-teal-700 truncate">{itemName}</span>
            </div>
          )}
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm font-semibold text-gray-800 truncate pr-4">{task.taskName}</p>
            <button
              onClick={onClose}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-4">
          <TaskCard task={task} role={role} onUpdate={onUpdate} />
        </div>
      </div>
    </div>
  )
}
