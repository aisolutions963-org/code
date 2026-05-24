'use client'

import { useState, useRef } from 'react'
import { Task, TaskUpdateInput, Role } from '@/lib/types'
import TaskCard from './TaskCard'
import TaskStatusBadge from './TaskStatusBadge'
import GateGroupCard from './GateGroupCard'

function SampleBranchSubCard({
  task,
  role,
  onUpdate,
}: {
  task: Task
  role: Role
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)

  const displayName = task.taskName
    .replace(/^sample branch:\s*/i, '')
    .replace(/\s*\(per item\)\s*$/i, '')
    .trim()

  const isCompleted = task.status === 'Completed'
  const isLocked = task.status === 'Locked'
  const isActive = !isCompleted && !isLocked

  return (
    <div
      className={`rounded-lg border overflow-hidden ${
        isCompleted
          ? 'border-green-200'
          : isLocked
            ? 'border-gray-200 opacity-50'
            : 'border-amber-200'
      }`}
    >
      <button
        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
          isCompleted
            ? 'bg-green-50 hover:bg-green-100'
            : isLocked
              ? 'bg-gray-50 cursor-default'
              : 'bg-amber-50 hover:bg-amber-100'
        }`}
        onClick={() => isActive && setExpanded((e) => !e)}
        disabled={isLocked}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            isCompleted ? 'bg-green-500' : isLocked ? 'bg-gray-300' : 'bg-amber-400'
          }`}
        />
        <span
          className={`flex-1 text-xs font-medium truncate ${
            isCompleted ? 'text-green-800' : isLocked ? 'text-gray-400' : 'text-amber-900'
          }`}
        >
          {displayName}
        </span>
        <TaskStatusBadge status={task.status} />
        {isActive && (
          <svg
            className={`w-3 h-3 shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      {expanded && isActive && (
        <div className="border-t border-amber-100">
          <TaskCard task={task} role={role} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  )
}

interface QuotationDetails {
  description?: string | null
  quantity?: number | null
  unitPrice?: number | null
}

interface ItemGroupSectionProps {
  itemId: string
  itemName: string
  projectId: string
  tasks: Task[]
  role: Role
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

export default function ItemGroupSection({
  itemId,
  itemName,
  projectId,
  tasks,
  role,
  onUpdate,
}: ItemGroupSectionProps) {
  const [details, setDetails] = useState<QuotationDetails | null>(null)
  const [fetching, setFetching] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const fetchedRef = useRef(false)

  async function fetchDetails() {
    if (fetchedRef.current) return
    fetchedRef.current = true
    setFetching(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/items`)
      if (!res.ok) return
      const data: { items: Array<{ id: string; quotation?: QuotationDetails | null }> } = await res.json()
      const match = data.items.find((i) => i.id === itemId)
      if (match?.quotation) setDetails(match.quotation)
    } catch {
      // non-critical
    } finally {
      setFetching(false)
    }
  }

  function handleMouseEnter() {
    setShowTooltip(true)
    fetchDetails()
  }

  const total =
    details?.quantity != null && details?.unitPrice != null
      ? (details.quantity * details.unitPrice).toLocaleString('en-AE', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : null

  // [GATE] tasks for this item — rendered as a GateGroupCard like Phase 1 approval gates
  const gateTasks = tasks.filter(
    (t) => /\[gate\]/i.test(t.taskName) && !/\[gateway\]/i.test(t.taskName),
  )
  const gateIds = new Set(gateTasks.map((t) => t.id))

  // "Sample Branch" sub-tasks (order 25, Select Sample path) — rendered compactly below parent
  const sampleBranchTasks = tasks.filter((t) =>
    t.taskName.toLowerCase().startsWith('sample branch:'),
  )
  const sampleBranchIds = new Set(sampleBranchTasks.map((t) => t.id))

  const mainTasks = tasks.filter((t) => !sampleBranchIds.has(t.id) && !gateIds.has(t.id))

  return (
    <div className="border border-teal-100 rounded-xl overflow-hidden">
      {/* Item group header */}
      <div
        className="relative flex items-center gap-2 px-3 py-2 bg-teal-50 border-b border-teal-100 cursor-default"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <div className="w-2 h-2 rounded-full bg-teal-400 shrink-0" />
        <span className="text-xs font-semibold text-teal-800 truncate">{itemName}</span>
        <span className="ml-auto text-xs text-teal-500 bg-teal-100 px-1.5 py-0.5 rounded-full shrink-0">
          {mainTasks.length + (gateTasks.length > 0 ? 1 : 0)} task{mainTasks.length + (gateTasks.length > 0 ? 1 : 0) !== 1 ? 's' : ''}
        </span>

        {/* Hover tooltip */}
        {showTooltip && (
          <div className="absolute left-0 top-full mt-1 z-50 w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-3 space-y-2 pointer-events-none">
            <p className="text-xs font-semibold text-gray-800">{itemName}</p>
            {fetching && <p className="text-xs text-gray-400">Loading…</p>}
            {!fetching && details && (
              <>
                {details.description && (
                  <p className="text-xs text-gray-600 whitespace-pre-line">{details.description}</p>
                )}
                <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
                  {details.quantity != null && (
                    <span className="text-xs text-gray-500">
                      Qty: <span className="font-medium text-gray-700">{details.quantity}</span>
                    </span>
                  )}
                  {details.unitPrice != null && (
                    <span className="text-xs text-gray-500">
                      Unit:{' '}
                      <span className="font-medium text-gray-700">
                        AED{' '}
                        {details.unitPrice.toLocaleString('en-AE', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </span>
                  )}
                  {total && (
                    <span className="ml-auto text-xs font-semibold text-gray-800">AED {total}</span>
                  )}
                </div>
              </>
            )}
            {!fetching && !details && (
              <p className="text-xs text-gray-400">No quotation details found</p>
            )}
          </div>
        )}
      </div>

      {/* Tasks inside the item group */}
      <div className="divide-y divide-gray-50">
        {mainTasks.map((task) => (
          <div key={task.id}>
            <TaskCard task={task} role={role} onUpdate={onUpdate} />
            {/* Compact branch sub-cards nested below the "Select Sample" task */}
            {task.pathCondition === 'Select Sample (item)' && sampleBranchTasks.length > 0 && (
              <div className="px-3 pb-3 pt-1.5 bg-gray-50 space-y-1.5 border-t border-gray-100">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                  Branch outcome
                </p>
                {sampleBranchTasks.map((bt) => (
                  <SampleBranchSubCard key={bt.id} task={bt} role={role} onUpdate={onUpdate} />
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Per-item approval gates — same visual treatment as Phase 1 GateGroupCard */}
        {gateTasks.length > 0 && (
          <div className="p-3">
            <GateGroupCard
              tasks={gateTasks}
              role={role}
              onUpdate={onUpdate}
              allClearMessage='"Take Approval from Client" task is now active. Both approvals confirmed — proceed to get fabrication sign-off.'
            />
          </div>
        )}
      </div>
    </div>
  )
}
