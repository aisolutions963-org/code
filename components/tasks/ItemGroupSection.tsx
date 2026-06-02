'use client'

import { useState, useRef } from 'react'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput, Role } from '@/lib/types'
import TaskCard from './TaskCard'
import GateGroupCard from './GateGroupCard'

type ActionPath = 'Site Visit (item)' | 'Select Sample (item)' | 'Design (item)' | 'Measurement (item)'

const ACTION_OPTIONS: { value: ActionPath; label: string }[] = [
  { value: 'Site Visit (item)', label: 'SED Site Visit' },
  { value: 'Select Sample (item)', label: 'Select/Order Sample' },
  { value: 'Design (item)', label: 'Design' },
  { value: 'Measurement (item)', label: 'Take Measurement' },
]


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
  allTaskPaths?: string[]
  role: Role
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
  onMutate?: () => void
}

export default function ItemGroupSection({
  itemId,
  itemName,
  projectId,
  tasks,
  allTaskPaths,
  role,
  onUpdate,
  onMutate,
}: ItemGroupSectionProps) {
  const [details, setDetails] = useState<QuotationDetails | null>(null)
  const [fetching, setFetching] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const [showAddActions, setShowAddActions] = useState(false)
  const [selectedActions, setSelectedActions] = useState<ActionPath[]>([])
  const [addingSaving, setAddingSaving] = useState(false)
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

  const existingPaths = new Set(
    allTaskPaths ?? tasks.map((t) => t.pathCondition).filter((p): p is string => !!p),
  )
  const availableNewActions = ACTION_OPTIONS.filter((o) => !existingPaths.has(o.value))

  async function handleAddActions() {
    if (selectedActions.length === 0) return
    setAddingSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/items/${itemId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions: selectedActions }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      toast.success(`${data.created} task${data.created !== 1 ? 's' : ''} added`)
      setShowAddActions(false)
      setSelectedActions([])
      onMutate?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add actions')
    } finally {
      setAddingSaving(false)
    }
  }

  // [GATE] tasks for this item — rendered as a GateGroupCard like Phase 1 approval gates
  const gateTasks = tasks.filter(
    (t) => /\[gate\]/i.test(t.taskName) && !/\[gateway\]/i.test(t.taskName),
  )
  const gateIds = new Set(gateTasks.map((t) => t.id))

  const mainTasks = tasks.filter((t) => !gateIds.has(t.id))

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
        {availableNewActions.length > 0 && ['sed', 'manager', 'superadmin'].includes(role) && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowAddActions((v) => !v) }}
            className="ml-1 text-[10px] text-teal-600 hover:text-teal-800 font-medium shrink-0 px-1.5 py-0.5 rounded hover:bg-teal-100 transition-colors"
          >
            + Actions
          </button>
        )}

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

      {/* Add actions panel */}
      {showAddActions && availableNewActions.length > 0 && (
        <div className="px-3 py-2.5 bg-teal-50 border-b border-teal-100 space-y-2">
          <p className="text-[11px] font-semibold text-teal-700">Add actions to this item</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {availableNewActions.map((opt) => (
              <label key={opt.value} className="flex items-center gap-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selectedActions.includes(opt.value)}
                  onChange={() =>
                    setSelectedActions((prev) =>
                      prev.includes(opt.value)
                        ? prev.filter((a) => a !== opt.value)
                        : [...prev, opt.value],
                    )
                  }
                  className="accent-teal-600"
                />
                <span className="text-xs text-gray-700">{opt.label}</span>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAddActions}
              disabled={addingSaving || selectedActions.length === 0}
              className="text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 px-3 py-1 rounded-lg transition-colors"
            >
              {addingSaving ? 'Adding…' : 'Add'}
            </button>
            <button
              onClick={() => { setShowAddActions(false); setSelectedActions([]) }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tasks inside the item group */}
      <div className="space-y-2 p-2">
        {mainTasks.map((task) => (
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
