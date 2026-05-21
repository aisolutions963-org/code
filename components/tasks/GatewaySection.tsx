'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput, Role, Attachment, DocLink } from '@/lib/types'
import { EDITABLE_FIELDS } from '@/lib/permissions'
import TaskStatusBadge from './TaskStatusBadge'
import FieldEditor from './FieldEditor'

function gatewayDisplayName(name: string): string {
  return name.replace(/^\[GATEWAY\]\s*/i, '').trim()
}

function pathDisplayName(name: string): string {
  return name.replace(/^\d+\s*[—\-]\s*/, '').trim()
}

function getEditableFieldsForRole(role: Role) {
  return EDITABLE_FIELDS[role] as (keyof TaskUpdateInput)[]
}

function getInitialValues(task: Task, keys: (keyof TaskUpdateInput)[]): Partial<TaskUpdateInput> {
  const result: Partial<TaskUpdateInput> = {}
  for (const key of keys) {
    const val = (task as unknown as Record<string, unknown>)[key]
    if (val !== undefined) (result as Record<string, unknown>)[key] = val
  }
  return result
}

const CHIP_CLASS: Record<string, string> = {
  'To Do':            'border-gray-300 bg-white text-gray-700 hover:border-brand-400 hover:bg-brand-50',
  'In Progress':      'border-brand-500 bg-brand-50 text-brand-700',
  'Pending Approval': 'border-amber-400 bg-amber-50 text-amber-700',
  'Completed':        'border-green-500 bg-green-50 text-green-700',
  'Locked':           'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed opacity-60',
}

interface ExpandedContentProps {
  task: Task
  role: Role
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

function ExpandedContent({ task, role, onUpdate }: ExpandedContentProps) {
  const keys = getEditableFieldsForRole(role)
  const [localFields, setLocalFields] = useState<Partial<TaskUpdateInput>>(() => getInitialValues(task, keys))
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  async function handleChange(key: keyof TaskUpdateInput, value: unknown) {
    setLocalFields((prev) => ({ ...prev, [key]: value }))
    setSaving(true)
    try {
      await onUpdate(task.id, { [key]: value } as Partial<TaskUpdateInput>)
      setSaveSuccess(true)
      toast.success('Saved')
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch {
      toast.error('Save failed')
      setLocalFields((prev) => ({ ...prev, [key]: (task as unknown as Record<string, unknown>)[key] }))
    } finally {
      setSaving(false)
    }
  }

  async function handleDocLinkAdded(fieldKey: string, link: DocLink) {
    const existing = (localFields[fieldKey as keyof TaskUpdateInput] as DocLink[]) ?? []
    const next = [...existing, link]
    setLocalFields((prev) => ({ ...prev, [fieldKey]: next }))
    try {
      await onUpdate(task.id, { [fieldKey]: next } as Partial<TaskUpdateInput>)
      toast.success('Link saved')
    } catch {
      toast.error('Failed to save link')
      setLocalFields((prev) => ({ ...prev, [fieldKey]: existing }))
    }
  }

  async function handleDocLinkRemoved(fieldKey: string, index: number) {
    const existing = (localFields[fieldKey as keyof TaskUpdateInput] as DocLink[]) ?? []
    const next = existing.filter((_, i) => i !== index)
    setLocalFields((prev) => ({ ...prev, [fieldKey]: next }))
    try {
      await onUpdate(task.id, { [fieldKey]: next } as Partial<TaskUpdateInput>)
      toast.success('Link removed')
    } catch {
      toast.error('Failed to remove link')
      setLocalFields((prev) => ({ ...prev, [fieldKey]: existing }))
    }
  }

  const instructions = task.instructions?.join(' ') ?? ''

  return (
    <div className="space-y-3">
      {instructions && (
        <p className="text-sm text-gray-600 whitespace-pre-wrap">{instructions}</p>
      )}
      <FieldEditor
        taskId={task.id}
        role={role}
        fields={localFields}
        onChange={handleChange}
        onDocLinkAdded={handleDocLinkAdded}
        onDocLinkRemoved={handleDocLinkRemoved}
        existingAttachments={{
          taskDocuments: task.taskDocuments,
          handoverDocument: task.handoverDocument,
          fillersAndMissingList: task.fillersAndMissingList,
        }}
      />
      <div className="min-h-[16px]">
        {saving && <span className="text-xs text-gray-400">Saving…</span>}
        {saveSuccess && !saving && <span className="text-xs text-green-600">Saved</span>}
      </div>
    </div>
  )
}

interface GatewaySectionProps {
  gateway?: Task
  pathTasks: Task[]
  role: Role
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

export default function GatewaySection({ gateway, pathTasks, role, onUpdate }: GatewaySectionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [roundConfirm, setRoundConfirm] = useState<string | null>(null)

  const expandedTask = pathTasks.find((t) => t.id === expandedId)

  function toggleChip(task: Task) {
    if (task.status === 'Locked') return
    setExpandedId((prev) => (prev === task.id ? null : task.id))
    setRoundConfirm(null)
  }

  async function handleRound2(task: Task) {
    setRoundConfirm(null)
    try {
      await onUpdate(task.id, { status: 'To Do' })
      toast.success('Ready for Round 2')
    } catch {
      toast.error('Failed')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Gateway header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold text-brand-500 uppercase tracking-widest mb-0.5">
            Choose Actions
          </p>
          <h3 className="text-sm font-bold text-gray-900">
            {gateway ? gatewayDisplayName(gateway.taskName) : 'The Action'}
          </h3>
        </div>
        {gateway && <TaskStatusBadge status={gateway.status} />}
      </div>

      {/* Action chips — indented */}
      <div className="pl-6 pr-4 pb-3 flex flex-wrap gap-2">
        {pathTasks.map((task) => {
          const isExpanded = expandedId === task.id
          const isDone = task.status === 'Completed'
          const chipClass = CHIP_CLASS[task.status] ?? CHIP_CLASS['To Do']

          return (
            <div key={task.id} className="flex flex-col items-start">
              <button
                onClick={() => toggleChip(task)}
                disabled={task.status === 'Locked'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all ${chipClass} ${isExpanded ? 'ring-2 ring-offset-1 ring-brand-300' : ''}`}
              >
                {isDone && (
                  <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {pathDisplayName(task.taskName)}
              </button>

              {isDone && (
                <div className="mt-0.5 ml-2 flex items-center gap-1">
                  {roundConfirm === task.id ? (
                    <>
                      <span className="text-[10px] text-gray-500">Start again?</span>
                      <button
                        onClick={() => handleRound2(task)}
                        className="text-[10px] font-semibold text-brand-600 hover:underline"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setRoundConfirm(null)}
                        className="text-[10px] text-gray-400 hover:underline"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setRoundConfirm(task.id)}
                      className="text-[10px] text-gray-400 hover:text-brand-500 transition-colors"
                    >
                      ↺ Round 2
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Expanded action content */}
      {expandedTask && (
        <div key={expandedTask.id} className="border-t border-gray-100 mx-4 mb-4 pt-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {pathDisplayName(expandedTask.taskName)}
          </p>
          <ExpandedContent task={expandedTask} role={role} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  )
}
