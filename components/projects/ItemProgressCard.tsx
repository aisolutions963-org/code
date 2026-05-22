'use client'

import { Task } from '@/lib/types'

const DEPT_COLORS: Record<string, string> = {
  SED: 'bg-blue-100 text-blue-700',
  Fabrication: 'bg-green-100 text-green-700',
  Installation: 'bg-violet-100 text-violet-700',
  Management: 'bg-orange-100 text-orange-700',
}

const FAB_PATH_COLORS: Record<string, string> = {
  Carpentry: 'bg-amber-100 text-amber-700',
  Paint: 'bg-pink-100 text-pink-700',
  'Carpentry + Paint': 'bg-orange-100 text-orange-700',
}

export interface ItemSummary {
  id: string
  name: string
  activeTasks: Task[]
  allTasks: Task[]
  completedCount: number
  totalCount: number
  isComplete: boolean
}

interface Props {
  item: ItemSummary
  index: number
  onSelect: () => void
}

function StepDots({ completed, total }: { completed: number; total: number }) {
  const MAX_DOTS = 8
  const showDots = Math.min(total, MAX_DOTS)
  const overflow = total > MAX_DOTS ? total - MAX_DOTS : 0
  const dotsCompleted = Math.min(completed, showDots)

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {Array.from({ length: showDots }).map((_, i) => {
        const isDone = i < dotsCompleted
        const isActive = i === dotsCompleted && !isDone
        return (
          <span
            key={i}
            className={`inline-block rounded-full transition-colors ${
              isDone
                ? 'w-2 h-2 bg-green-500'
                : isActive
                ? 'w-2 h-2 bg-teal-500'
                : 'w-2 h-2 bg-gray-200'
            }`}
          />
        )
      })}
      {overflow > 0 && (
        <span className="text-xs text-gray-400 font-medium">+{overflow}</span>
      )}
      <span className="ml-1 text-xs text-gray-400">{completed}/{total}</span>
    </div>
  )
}

export default function ItemProgressCard({ item, index, onSelect }: Props) {
  const { name, activeTasks, completedCount, totalCount, isComplete } = item
  const activeTask = activeTasks[0] ?? null
  const isWaiting = !isComplete && !activeTask

  const accentClass = isComplete
    ? 'border-l-green-400'
    : activeTask
    ? 'border-l-teal-400'
    : 'border-l-gray-300'

  const deptLabel = activeTask?.department?.[0]
  const deptClass = deptLabel ? (DEPT_COLORS[deptLabel] ?? 'bg-gray-100 text-gray-600') : null
  const fabPath = activeTask?.fabricationPath
  const fabPathClass = fabPath ? (FAB_PATH_COLORS[fabPath] ?? 'bg-gray-100 text-gray-600') : null

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left bg-white rounded-xl border border-gray-100 border-l-4 ${accentClass} shadow-sm overflow-hidden hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150 cursor-pointer`}
    >
      {/* Card header */}
      <div className={`px-4 pt-4 pb-3 ${isComplete ? 'bg-gradient-to-r from-green-50 to-white' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900 leading-snug">{name}</h3>
          <div className="flex items-center gap-1.5 shrink-0">
            {isComplete && (
              <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Done
              </span>
            )}
            <span className="w-6 h-6 flex items-center justify-center bg-gray-100 text-gray-500 rounded-full text-xs font-semibold shrink-0">
              {index + 1}
            </span>
          </div>
        </div>
      </div>

      {/* Active task section */}
      <div className="px-4 pb-4 space-y-3">
        {!isComplete && (
          <>
            {activeTask ? (
              <div className="bg-teal-50 rounded-lg px-3 py-2.5">
                <p className="text-xs font-medium text-teal-600 uppercase tracking-wide mb-0.5">
                  Current step
                </p>
                <p className="text-sm text-teal-800 font-semibold leading-snug">
                  {activeTask.taskName}
                </p>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {deptLabel && deptClass && (
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${deptClass}`}>
                      {deptLabel}
                    </span>
                  )}
                  {fabPath && fabPathClass && (
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${fabPathClass}`}>
                      {fabPath}
                    </span>
                  )}
                  {activeTask.status === 'In Progress' && (
                    <span className="text-xs text-blue-600 font-medium">· In Progress</span>
                  )}
                </div>
              </div>
            ) : isWaiting ? (
              <div className="bg-gray-50 rounded-lg px-3 py-2.5 flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <p className="text-xs text-gray-400">Waiting for previous step</p>
              </div>
            ) : null}
          </>
        )}

        {/* Step dots */}
        {totalCount > 0 && (
          <StepDots completed={completedCount} total={totalCount} />
        )}
      </div>
    </button>
  )
}
