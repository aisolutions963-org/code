'use client'

import { useState, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput, Role, Attachment } from '@/lib/types'
import { EDITABLE_FIELDS } from '@/lib/permissions'
import TaskStatusBadge from './TaskStatusBadge'
import FieldEditor from './FieldEditor'

type CallOutcome = 'approved' | 'review' | 'refused'

const OUTCOME_CONFIG: Record<CallOutcome, {
  label: string
  description: string
  consequence: string
  color: string
  confirmColor: string
}> = {
  approved: {
    label: 'Approved',
    description: 'Client confirmed — project moves forward',
    consequence: 'Project advances to Phase 2 (Open) and Phase 2 tasks are generated.',
    color: 'border-green-300 bg-green-50 text-green-800 hover:bg-green-100',
    confirmColor: 'bg-green-600 hover:bg-green-700 text-white',
  },
  review: {
    label: 'Needs Review',
    description: 'Client wants changes — repeat action steps',
    consequence: 'Action tasks (paths, gates) are reset to To Do. SED restarts the action flow.',
    color: 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100',
    confirmColor: 'bg-amber-500 hover:bg-amber-600 text-white',
  },
  refused: {
    label: 'Refused',
    description: 'Client declined — project rejected',
    consequence: 'Project is marked Not-Approved. No further tasks will be generated.',
    color: 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100',
    confirmColor: 'bg-red-600 hover:bg-red-700 text-white',
  },
}

function CallClientDecisionPanel({
  taskId,
  onDecided,
}: {
  taskId: string
  onDecided: () => void
}) {
  const [pending, setPending] = useState<CallOutcome | null>(null)
  const [saving, setSaving] = useState(false)

  async function confirm() {
    if (!pending) return
    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}/call-outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: pending }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed')
      }
      toast.success(`Recorded: ${OUTCOME_CONFIG[pending].label}`)
      onDecided()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to record outcome')
      setSaving(false)
      setPending(null)
    }
  }

  if (pending) {
    const cfg = OUTCOME_CONFIG[pending]
    return (
      <div className="mt-4 border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-3">
        <p className="text-xs font-semibold text-gray-700">Confirm outcome: {cfg.label}</p>
        <p className="text-xs text-gray-500">{cfg.consequence}</p>
        <div className="flex gap-2">
          <button
            onClick={confirm}
            disabled={saving}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 ${cfg.confirmColor}`}
          >
            {saving ? 'Saving…' : `Confirm ${cfg.label}`}
          </button>
          <button
            onClick={() => setPending(null)}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Call Outcome — End of Phase 1
      </p>
      <div className="grid grid-cols-1 gap-2">
        {(Object.entries(OUTCOME_CONFIG) as [CallOutcome, typeof OUTCOME_CONFIG[CallOutcome]][]).map(
          ([key, cfg]) => (
            <button
              key={key}
              onClick={() => setPending(key)}
              className={`text-left border rounded-lg px-3 py-2.5 transition-colors ${cfg.color}`}
            >
              <p className="text-xs font-bold">{cfg.label}</p>
              <p className="text-[11px] opacity-80 mt-0.5">{cfg.description}</p>
            </button>
          ),
        )}
      </div>
    </div>
  )
}

interface TaskCardProps {
  task: Task
  role: Role
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

const INSPECTION_KEYWORDS = ['inspect', 'qc check', 'site check', 'handover', 'snagging']
const CALL_CLIENT_KEYWORD = 'call the client'

function isCallClientDecisionTask(task: Task, role: Role): boolean {
  return (
    (role === 'sed' || role === 'superadmin') &&
    task.taskName.toLowerCase().includes(CALL_CLIENT_KEYWORD) &&
    (task.status === 'To Do' || task.status === 'In Progress')
  )
}

const DEPT_BORDER: Record<string, string> = {
  SED:           'border-l-blue-400',
  Superadmin:    'border-l-red-400',
  Fabrication:   'border-l-green-400',
  Installation:  'border-l-violet-400',
  Management:    'border-l-yellow-400',
  Purchase:      'border-l-yellow-400',
}

function deptBorder(departments: string[]): string {
  for (const d of departments) {
    if (DEPT_BORDER[d]) return DEPT_BORDER[d]
  }
  return 'border-l-gray-300'
}

function isInspectionTask(taskName: string): boolean {
  const lower = taskName.toLowerCase()
  return INSPECTION_KEYWORDS.some((kw) => lower.includes(kw))
}

function isArabicRole(role: Role): boolean {
  return role === 'installation' || role === 'fabrication'
}

function formatCountdown(targetDate: string, ar: boolean): string | null {
  const diff = new Date(targetDate).getTime() - Date.now()
  if (diff <= 0) return ar ? 'متأخر' : 'Overdue'
  const days = Math.floor(diff / (24 * 60 * 60 * 1000))
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  if (ar) return days > 0 ? `${days}ي ${hours}س` : `${hours}س`
  if (days > 0) return `${days}d ${hours}h`
  return `${hours}h`
}

const URGENCY_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000

function isUrgent(task: Task): boolean {
  const date = task.taskStartDate ?? task.completionDate
  if (!date) return false
  const diff = new Date(date).getTime() - Date.now()
  return diff > 0 && diff < URGENCY_THRESHOLD_MS
}

function getEditableFieldsForRole(role: Role): (keyof TaskUpdateInput)[] {
  return EDITABLE_FIELDS[role] as (keyof TaskUpdateInput)[]
}

function getInitialFieldValues(
  task: Task,
  keys: (keyof TaskUpdateInput)[],
): Partial<TaskUpdateInput> {
  const result: Partial<TaskUpdateInput> = {}
  for (const key of keys) {
    const val = (task as unknown as Record<string, unknown>)[key]
    if (val !== undefined) {
      ;(result as Record<string, unknown>)[key] = val
    }
  }
  return result
}

export default function TaskCard({ task, role, onUpdate }: TaskCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [localFields, setLocalFields] = useState<Partial<TaskUpdateInput>>(
    () => getInitialFieldValues(task, getEditableFieldsForRole(role)),
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const ar = isArabicRole(role)
  const urgent = isUrgent(task)
  const isDecisionTask = isCallClientDecisionTask(task, role)

  const scheduleUpdate = useCallback(
    (key: keyof TaskUpdateInput, value: unknown) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        setSaving(true)
        setSaveError('')
        try {
          await onUpdate(task.id, { [key]: value } as Partial<TaskUpdateInput>)
          setSaveSuccess(true)
          toast.success(ar ? 'تم الحفظ' : 'Saved')
          setTimeout(() => setSaveSuccess(false), 2000)
        } catch {
          setSaveError(ar ? 'فشل الحفظ — أعد المحاولة' : 'Save failed — please retry')
          toast.error(ar ? 'فشل الحفظ' : 'Save failed')
          setLocalFields((prev) => ({ ...prev, [key]: (task as unknown as Record<string, unknown>)[key] }))
        } finally {
          setSaving(false)
        }
      }, 500)
    },
    [onUpdate, task],
  )

  function handleChange(key: keyof TaskUpdateInput, value: unknown) {
    setLocalFields((prev) => ({ ...prev, [key]: value }))
    scheduleUpdate(key, value)
  }

  function handleFileUploaded(fieldKey: string, att: { url: string; filename: string }) {
    const existingArr = (localFields[fieldKey as keyof TaskUpdateInput] as Attachment[]) ?? []
    const next = [...existingArr, att]
    setLocalFields((prev) => ({ ...prev, [fieldKey]: next }))
    onUpdate(task.id, { [fieldKey]: next } as Partial<TaskUpdateInput>)
  }

  const projectLabel = task.projectRef ?? task.project?.[0] ?? ''
  const instructions = task.instructions?.join(' ') ?? ''
  const arabicInstructions = task.arabicInstructions?.join(' ') ?? ''

  return (
    <div
      className={`bg-white rounded-xl border-gray-200 border shadow-sm overflow-hidden transition-shadow hover:shadow-md border-l-4 ${
        isDecisionTask ? 'border-l-teal-500' : urgent ? 'border-l-orange-500' : deptBorder(task.department)
      }`}
    >
      {/* Header */}
      <button
        className="w-full text-left px-4 py-3 flex items-start justify-between gap-3"
        onClick={() => setIsOpen((o) => !o)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 truncate">
              {task.taskName}
            </span>
            {isDecisionTask && (
              <span className="text-[10px] font-bold text-teal-700 bg-teal-100 border border-teal-300 px-1.5 py-0.5 rounded uppercase tracking-wide">
                Decision Required
              </span>
            )}
            {task.priorityFlag && (
              <span className="text-xs font-medium" title="Priority task">🚩</span>
            )}
            {urgent && (
              <span className="text-xs text-red-600 font-medium bg-red-50 px-1.5 py-0.5 rounded">
                {ar ? 'عاجل' : 'Urgent'}
              </span>
            )}
            {isInspectionTask(task.taskName) && (task.completionDate ?? task.taskStartDate) && (
              <span className="text-xs text-purple-700 font-medium bg-purple-50 px-1.5 py-0.5 rounded">
                {formatCountdown(task.completionDate ?? task.taskStartDate ?? '', ar)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {projectLabel && (
              <span className="text-xs text-gray-500 font-mono">{projectLabel}</span>
            )}
            <TaskStatusBadge status={task.status} />
            {task.department.length > 0 && (
              <span className="text-xs text-gray-400">{task.department.join(', ')}</span>
            )}
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 shrink-0 mt-0.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Client contact bar */}
      {task.clientPhone && (
        <div className="px-4 py-2 bg-blue-50 border-t border-blue-100 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          <span className="text-xs text-blue-700 font-medium">{ar ? 'العميل:' : 'Client:'}</span>
          <a href={`tel:${task.clientPhone}`} className="text-xs text-blue-600 hover:underline font-mono">
            {task.clientPhone}
          </a>
        </div>
      )}

      {/* Body */}
      {isOpen && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-4">
          {/* Read-only info */}
          {ar ? (
            (arabicInstructions || instructions) && (
              <div dir="rtl">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  التعليمات
                </p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {arabicInstructions || instructions}
                </p>
              </div>
            )
          ) : (
            <>
              {instructions && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Instructions
                  </p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{instructions}</p>
                </div>
              )}
              {arabicInstructions && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Arabic Instructions
                  </p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap rtl-text" dir="rtl">
                    {arabicInstructions}
                  </p>
                </div>
              )}
            </>
          )}

          {/* Editable fields */}
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

          {/* Call the Client — Phase 1 decision panel */}
          {isCallClientDecisionTask(task, role) && (
            <CallClientDecisionPanel
              taskId={task.id}
              onDecided={() => onUpdate(task.id, {})}
            />
          )}

          {/* Save state */}
          <div className="flex items-center gap-2 min-h-[20px]">
            {saving && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {ar ? 'جاري الحفظ…' : 'Saving…'}
              </span>
            )}
            {saveSuccess && !saving && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {ar ? 'تم الحفظ' : 'Saved'}
              </span>
            )}
            {saveError && (
              <span className="text-xs text-red-600">{saveError}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
