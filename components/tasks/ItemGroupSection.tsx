'use client'

import { useState, useRef } from 'react'
import { Task, TaskUpdateInput, Role } from '@/lib/types'
import TaskCard from './TaskCard'
import GateGroupCard from './GateGroupCard'
import GatewaySection from './GatewaySection'
import NextUpPreview from './NextUpPreview'

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
  onMutate?: () => void
  /** Preview of this item's next single locked step, shown at the top. */
  nextStep?: string | null
}

export default function ItemGroupSection({
  itemId,
  itemName,
  projectId,
  tasks,
  role,
  onUpdate,
  nextStep,
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

  const rest = tasks.filter((t) => !gateIds.has(t.id))
  // Per-item action tasks carry a path condition — render them as gateway chips,
  // exactly like the Phase 1 Preparing gateway. Non-path tasks (Take Approval,
  // Click Done…) render as regular cards in chronological (earliest-generated first) order.
  const pathTasks = rest.filter((t) => !!t.pathCondition)
  const otherTasks = rest
    .filter((t) => !t.pathCondition)
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))

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
          {otherTasks.length + pathTasks.length + (gateTasks.length > 0 ? 1 : 0)} task{otherTasks.length + pathTasks.length + (gateTasks.length > 0 ? 1 : 0) !== 1 ? 's' : ''}
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
      <div className="space-y-2 p-2">
        {nextStep && <NextUpPreview label={nextStep} />}

        {/* Per-item action chips — same UI as the Phase 1 Preparing gateway */}
        {pathTasks.length > 0 && (
          <GatewaySection pathTasks={pathTasks} role={role} onUpdate={onUpdate} />
        )}

        {otherTasks.map((task) => (
          <TaskCard key={task.id} task={task} role={role} onUpdate={onUpdate} />
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
