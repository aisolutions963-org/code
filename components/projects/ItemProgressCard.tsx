'use client'

import { Task } from '@/lib/types'

const DEPT_COLORS: Record<string, string> = {
  SED: 'bg-blue-100 text-blue-700',
  Fabrication: 'bg-green-100 text-green-700',
  Installation: 'bg-violet-100 text-violet-700',
  Management: 'bg-orange-100 text-orange-700',
}

function deptBadge(departments: string[]) {
  const dept = departments[0]
  if (!dept) return null
  const cls = DEPT_COLORS[dept] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cls}`}>{dept}</span>
  )
}

export interface ItemSummary {
  id: string
  name: string
  activeTasks: Task[]
  completedCount: number
  totalCount: number
  isComplete: boolean
}

interface Props {
  item: ItemSummary
  onTaskClick: (task: Task) => void
}

export default function ItemProgressCard({ item, onTaskClick }: Props) {
  const { name, activeTasks, completedCount, totalCount, isComplete } = item
  const activeTask = activeTasks[0] ?? null
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  let borderClass = 'border-gray-200'
  if (isComplete) borderClass = 'border-green-300'
  else if (activeTask) borderClass = 'border-teal-300'

  return (
    <div className={`bg-white rounded-xl border ${borderClass} shadow-sm p-4 space-y-3`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 leading-snug">{name}</h3>
        {isComplete && (
          <span className="shrink-0 flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Done
          </span>
        )}
      </div>

      {/* Current active task */}
      {!isComplete && (
        <div>
          {activeTask ? (
            <button
              onClick={() => onTaskClick(activeTask)}
              className="w-full text-left group"
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0 mt-1.5" />
                <div className="min-w-0">
                  <p className="text-sm text-teal-700 font-medium group-hover:text-teal-900 group-hover:underline leading-snug">
                    {activeTask.taskName}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    {deptBadge(activeTask.department)}
                    {activeTask.status === 'In Progress' && (
                      <span className="text-xs text-blue-600 font-medium">In Progress</span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ) : (
            <p className="text-xs text-gray-400 italic">Waiting…</p>
          )}
        </div>
      )}

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{completedCount} / {totalCount} steps</span>
          <span className="text-xs text-gray-400">{progressPct}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all duration-300 ${isComplete ? 'bg-green-500' : 'bg-teal-500'}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  )
}
