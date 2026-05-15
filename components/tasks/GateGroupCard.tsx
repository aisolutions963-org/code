'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput, Role, Attachment } from '@/lib/types'
import { EDITABLE_FIELDS } from '@/lib/permissions'
import TaskStatusBadge from './TaskStatusBadge'
import FieldEditor from './FieldEditor'

function gateDisplayName(name: string): string {
  return name.replace(/^\[GATE\]\s*/i, '').trim()
}

function getGateField(taskName: string): keyof TaskUpdateInput | null {
  const n = taskName.toLowerCase()
  if (n.includes('concept') || n.includes('design')) return 'conceptDesignApproval'
  if (n.includes('sample')) return 'sampleApproval'
  if (n.includes('quotation')) return 'quotationOutcome'
  return null
}

function ApprovalPill({ value }: { value?: string }) {
  const [bg, text] =
    value === 'Approved' || value === 'Accepted'
      ? ['bg-green-100 border-green-300', 'text-green-700']
      : value === 'Rejected'
        ? ['bg-red-100 border-red-300', 'text-red-700']
        : value === 'Pending'
          ? ['bg-amber-100 border-amber-300', 'text-amber-700']
          : value === 'Negotiating'
            ? ['bg-blue-100 border-blue-300', 'text-blue-700']
            : ['bg-gray-100 border-gray-200', 'text-gray-400']

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold ${bg} ${text}`}>
      {value ?? 'Not set'}
    </span>
  )
}

function getInitialValues(task: Task, keys: (keyof TaskUpdateInput)[]): Partial<TaskUpdateInput> {
  const result: Partial<TaskUpdateInput> = {}
  for (const key of keys) {
    const val = (task as unknown as Record<string, unknown>)[key]
    if (val !== undefined) (result as Record<string, unknown>)[key] = val
  }
  return result
}

interface GateRowExpandedProps {
  task: Task
  role: Role
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

function GateRowExpanded({ task, role, onUpdate }: GateRowExpandedProps) {
  const keys = EDITABLE_FIELDS[role] as (keyof TaskUpdateInput)[]
  const [localFields, setLocalFields] = useState<Partial<TaskUpdateInput>>(() =>
    getInitialValues(task, keys),
  )
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
      setLocalFields((prev) => ({
        ...prev,
        [key]: (task as unknown as Record<string, unknown>)[key],
      }))
    } finally {
      setSaving(false)
    }
  }

  function handleFileUploaded(fieldKey: string, att: { url: string; filename: string }) {
    const existing = (localFields[fieldKey as keyof TaskUpdateInput] as Attachment[]) ?? []
    const next = [...existing, att]
    setLocalFields((prev) => ({ ...prev, [fieldKey]: next }))
    onUpdate(task.id, { [fieldKey]: next } as Partial<TaskUpdateInput>)
  }

  return (
    <div className="px-5 pb-4 pt-3 space-y-3 bg-violet-50/60 border-t border-violet-100">
      <FieldEditor
        taskId={task.id}
        role={role}
        fields={localFields}
        onChange={handleChange}
        onFileUploaded={handleFileUploaded}
        existingAttachments={{
          taskDocuments: task.taskDocuments,
          handoverDocument: task.handoverDocument,
          fillersAndMissingList: task.fillersAndMissingList,
        }}
      />
      <div className="min-h-[16px]">
        {saving && <span className="text-xs text-violet-400">Saving…</span>}
        {saveSuccess && !saving && <span className="text-xs text-green-600">Saved</span>}
      </div>
    </div>
  )
}

interface GateGroupCardProps {
  tasks: Task[]
  role: Role
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

export default function GateGroupCard({ tasks, role, onUpdate }: GateGroupCardProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const allApproved = tasks.every((t) => {
    const field = getGateField(t.taskName)
    if (!field) return false
    const val = (t as unknown as Record<string, unknown>)[field] as string | undefined
    return val === 'Approved' || val === 'Accepted'
  })

  return (
    <div className={`rounded-xl border-2 shadow-sm overflow-hidden ${allApproved ? 'border-green-400' : 'border-violet-300'}`}>
      {/* Header */}
      <div className={`px-4 py-2.5 flex items-center gap-2.5 ${allApproved ? 'bg-green-600' : 'bg-violet-700'}`}>
        <svg className="w-4 h-4 text-white/80 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <span className="text-xs font-bold text-white uppercase tracking-widest">
          {allApproved ? 'All Approved' : 'Approval Gates'}
        </span>
        {allApproved && (
          <svg className="w-4 h-4 text-white ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>

      {/* All-clear banner */}
      {allApproved && (
        <div className="px-4 py-3 bg-green-50 border-b border-green-200 flex items-start gap-3">
          <svg className="w-4 h-4 text-green-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-green-800">All gates cleared</p>
            <p className="text-xs text-green-700 mt-0.5">
              &ldquo;Call the Client — All Approvals&rdquo; task is now active. Call to get final confirmation or restart any action above.
            </p>
          </div>
        </div>
      )}

      {/* Gate rows */}
      <div className="bg-white divide-y divide-violet-100">
        {tasks.map((task) => {
          const primaryField = getGateField(task.taskName)
          const approvalValue = primaryField
            ? ((task as unknown as Record<string, unknown>)[primaryField] as string | undefined)
            : undefined
          const isExpanded = expandedId === task.id

          return (
            <div key={task.id}>
              <button
                onClick={() => setExpandedId((prev) => (prev === task.id ? null : task.id))}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-violet-50/50 transition-colors text-left"
              >
                {/* Approval dot */}
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  approvalValue === 'Approved' || approvalValue === 'Accepted'
                    ? 'bg-green-500'
                    : approvalValue === 'Rejected'
                      ? 'bg-red-500'
                      : approvalValue === 'Pending'
                        ? 'bg-amber-400'
                        : approvalValue === 'Negotiating'
                          ? 'bg-blue-400'
                          : 'bg-gray-300'
                }`} />

                {/* Gate name */}
                <span className="flex-1 text-sm font-medium text-gray-800">
                  {gateDisplayName(task.taskName)}
                </span>

                {/* Approval pill */}
                <ApprovalPill value={approvalValue} />

                {/* Task status badge */}
                <TaskStatusBadge status={task.status} />

                {/* Chevron */}
                <svg
                  className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isExpanded && (
                <GateRowExpanded key={task.id} task={task} role={role} onUpdate={onUpdate} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
