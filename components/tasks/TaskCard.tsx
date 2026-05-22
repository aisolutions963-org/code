'use client'

import { useState, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput, Role, Attachment, DocLink } from '@/lib/types'
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
    label: 'Rejected',
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
    role === 'superadmin' &&
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
  const [showHint, setShowHint] = useState(false)
  const [localFields, setLocalFields] = useState<Partial<TaskUpdateInput>>(
    () => getInitialFieldValues(task, getEditableFieldsForRole(role)),
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isMakeQuotation =
    task.pathCondition === 'Make Quotation' ||
    task.taskName.toLowerCase().includes('make quotation')
  const isF4Task = task.taskName.toLowerCase().startsWith('f4 —')
  const isOrderSample = task.taskName === 'Order Sample'
  const [quotationInput, setQuotationInput] = useState(task.projectQuotationNumber ?? '')

  // Pre-calculate the next revision reference for Make Quotation
  function calcNextRef(qn: string): string {
    if (!task.projectQuotationReference || qn.trim() !== (task.projectQuotationNumber ?? '').trim()) return 'R0'
    const n = parseInt(task.projectQuotationReference.slice(1), 10)
    return `R${isNaN(n) ? 1 : n + 1}`
  }
  const [referenceInput, setReferenceInput] = useState(() => {
    if (isMakeQuotation) return calcNextRef(task.projectQuotationNumber ?? '')
    if (isF4Task) return task.projectQuotationReference ?? ''
    return ''
  })
  const [quotationError, setQuotationError] = useState('')

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

  async function saveQuotationAndComplete() {
    const projectId = task.project?.[0]
    if (!projectId) return
    setSaving(true)
    setQuotationError('')
    try {
      const existingQN = (task.projectQuotationNumber ?? '').trim()
      const newQN = quotationInput.trim()
      // Only patch the project if the quotation number changed or a reference was explicitly entered.
      // For F4, we avoid auto-incrementing an existing reference when just confirming payment.
      const needsPatch = newQN && (newQN !== existingQN || referenceInput.trim())
      if (needsPatch) {
        const patchBody: Record<string, string> = { quotationNumber: newQN }
        if (referenceInput.trim()) patchBody.quotationReference = referenceInput.trim()
        const patchRes = await fetch(`/api/projects/${projectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchBody),
        })
        if (!patchRes.ok) {
          const d = await patchRes.json().catch(() => ({}))
          throw new Error((d as { error?: string }).error ?? 'Failed to save quotation number')
        }
      }
      setLocalFields((prev) => ({ ...prev, status: 'Completed' }))
      await onUpdate(task.id, { status: 'Completed' } as Partial<TaskUpdateInput>)
      setSaveSuccess(true)
      toast.success('Saved')
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (e) {
      setQuotationError(e instanceof Error ? e.message : 'Failed')
      toast.error('Failed')
    } finally {
      setSaving(false)
    }
  }

  async function completeOrderSampleBranch(hasMaterial: boolean) {
    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}/complete-branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hasMaterial }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Failed')
      }
      setLocalFields((prev) => ({ ...prev, status: 'Completed' }))
      toast.success(hasMaterial ? 'Branch: We have material' : 'Branch: Ordering material')
      await onUpdate(task.id, {})
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  function handleChange(key: keyof TaskUpdateInput, value: unknown) {
    if (isOrderSample && key === 'status' && value === 'Completed') {
      return
    }
    // F4 is a one-time action — once completed the status cannot be rolled back
    if (isF4Task && task.status === 'Completed' && key === 'status') {
      return
    }
    if ((isMakeQuotation || isF4Task) && key === 'status' && value === 'Completed') {
      if (!quotationInput.trim()) {
        setQuotationError('Enter a quotation number before marking as complete')
        return
      }
      saveQuotationAndComplete()
      return
    }
    setLocalFields((prev) => ({ ...prev, [key]: value }))
    scheduleUpdate(key, value)
  }

  async function handleDocLinkAdded(fieldKey: string, link: DocLink) {
    const existingArr = (localFields[fieldKey as keyof TaskUpdateInput] as DocLink[]) ?? []
    const next = [...existingArr, link]
    setLocalFields((prev) => ({ ...prev, [fieldKey]: next }))
    try {
      await onUpdate(task.id, { [fieldKey]: next } as Partial<TaskUpdateInput>)
      toast.success(ar ? 'تم حفظ الرابط' : 'Link saved')
    } catch {
      toast.error(ar ? 'فشل الحفظ' : 'Failed to save link')
      setLocalFields((prev) => ({ ...prev, [fieldKey]: existingArr }))
    }
  }

  async function handleDocLinkRemoved(fieldKey: string, index: number) {
    const existingArr = (localFields[fieldKey as keyof TaskUpdateInput] as DocLink[]) ?? []
    const next = existingArr.filter((_, i) => i !== index)
    setLocalFields((prev) => ({ ...prev, [fieldKey]: next }))
    try {
      await onUpdate(task.id, { [fieldKey]: next } as Partial<TaskUpdateInput>)
      toast.success(ar ? 'تم حذف الرابط' : 'Link removed')
    } catch {
      toast.error(ar ? 'فشل الحذف' : 'Failed to remove link')
      setLocalFields((prev) => ({ ...prev, [fieldKey]: existingArr }))
    }
  }

  const projectLabel = task.projectNickname
    ? task.projectName
      ? `${task.projectNickname} — ${task.projectName}`
      : task.projectNickname
    : (task.projectName ?? task.projectRef ?? task.project?.[0] ?? '')
  const instructions = task.instructions?.join(' ') ?? ''
  const arabicInstructions = task.arabicInstructions?.join(' ') ?? ''
  const hintText = ar ? (arabicInstructions || instructions) : instructions

  // Decision task: render only the outcome panel, nothing else
  if (isDecisionTask) {
    return (
      <div className="bg-white rounded-xl border border-teal-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-teal-100 flex items-center gap-2">
          <span className="text-[10px] font-bold text-teal-700 bg-teal-100 border border-teal-200 px-1.5 py-0.5 rounded uppercase tracking-wide">
            Decision Required
          </span>
          {projectLabel && (
            <span className="text-xs text-gray-500 font-mono">{projectLabel}</span>
          )}
        </div>
        <div className="px-4 py-4">
          <CallClientDecisionPanel
            taskId={task.id}
            onDecided={() => onUpdate(task.id, {})}
          />
        </div>
      </div>
    )
  }

  return (
    <div
      className={`bg-white rounded-xl border-gray-200 border shadow-sm overflow-hidden transition-shadow hover:shadow-md border-l-4 ${
        urgent ? 'border-l-orange-500' : deptBorder(task.department)
      }`}
      onMouseEnter={() => setShowHint(true)}
      onMouseLeave={() => setShowHint(false)}
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
            {task.priorityFlag && (
              <span className="text-xs font-medium" title="Priority task">🚩</span>
            )}
            {urgent && (
              <span className="text-xs text-red-600 font-medium bg-red-50 px-1.5 py-0.5 rounded">
                {ar ? 'عاجل' : 'Urgent'}
              </span>
            )}
            {task.projectItemName && (
              <span className="text-xs text-teal-700 font-medium bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100">
                {task.projectItemName}
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
              <span className="text-xs text-gray-500">{projectLabel}</span>
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

      {/* Hover hint */}
      {showHint && !isOpen && hintText && (
        <div
          className="px-4 py-2.5 bg-indigo-50 border-t border-indigo-100 text-xs text-indigo-800 leading-relaxed"
          dir={ar ? 'rtl' : 'ltr'}
        >
          <span className="font-semibold text-indigo-600">{ar ? 'ماذا تفعل: ' : 'What to do: '}</span>
          {hintText}
        </div>
      )}

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

          {/* Quotation number — required before completing Make Quotation */}
          {isMakeQuotation && task.status !== 'Completed' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-3 space-y-2">
              <p className="text-xs font-semibold text-amber-800">
                Quotation Number <span className="text-red-500">*</span>
                <span className="ml-1 font-normal text-amber-600">— required to complete this task</span>
              </p>
              <input
                className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                placeholder="e.g. WW-2024-001"
                value={quotationInput}
                onChange={(e) => { setQuotationInput(e.target.value); setQuotationError('') }}
              />
              <p className="text-xs font-semibold text-amber-800 mt-1">
                Reference Number <span className="font-normal text-amber-600">— leave blank to auto-assign R0</span>
              </p>
              <input
                className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white font-mono"
                placeholder="e.g. R0"
                value={referenceInput}
                onChange={(e) => setReferenceInput(e.target.value)}
              />
              {quotationError && (
                <p className="text-xs text-red-600">{quotationError}</p>
              )}
            </div>
          )}

          {/* F4 — quotation number/reference (required if not already on project) */}
          {isF4Task && task.status !== 'Completed' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-3 space-y-2">
              <p className="text-xs font-semibold text-blue-800">
                Quotation Number <span className="text-red-500">*</span>
                <span className="ml-1 font-normal text-blue-600">
                  {task.projectQuotationNumber ? '— already set, update if needed' : '— required to record advance payment'}
                </span>
              </p>
              <input
                className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                placeholder="e.g. WW-2024-001"
                value={quotationInput}
                onChange={(e) => { setQuotationInput(e.target.value); setQuotationError('') }}
              />
              <p className="text-xs font-semibold text-blue-800 mt-1">
                Reference Number
                <span className="ml-1 font-normal text-blue-600">
                  {task.projectQuotationReference ? `— currently ${task.projectQuotationReference}` : '— leave blank to auto-assign R0'}
                </span>
              </p>
              <input
                className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white font-mono"
                placeholder="e.g. R1"
                value={referenceInput}
                onChange={(e) => setReferenceInput(e.target.value)}
              />
              {quotationError && (
                <p className="text-xs text-red-600">{quotationError}</p>
              )}
            </div>
          )}

          {/* Order Sample — branch selector */}
          {isOrderSample && task.status !== 'Completed' && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-3 space-y-2">
              <p className="text-xs font-semibold text-green-800">
                Sample Branch <span className="font-normal text-green-700">— does the team have the material?</span>
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => completeOrderSampleBranch(true)}
                  disabled={saving}
                  className="border border-green-400 bg-green-100 text-green-900 text-xs font-semibold px-3 py-2.5 rounded-lg hover:bg-green-200 transition-colors disabled:opacity-60 text-left"
                >
                  <div className="font-bold">✓ We Have It</div>
                  <div className="font-normal text-green-700 mt-0.5">Send to Fabrication</div>
                </button>
                <button
                  onClick={() => completeOrderSampleBranch(false)}
                  disabled={saving}
                  className="border border-orange-300 bg-orange-50 text-orange-900 text-xs font-semibold px-3 py-2.5 rounded-lg hover:bg-orange-100 transition-colors disabled:opacity-60 text-left"
                >
                  <div className="font-bold">✗ Need to Order</div>
                  <div className="font-normal text-orange-700 mt-0.5">Request F3 material order</div>
                </button>
              </div>
            </div>
          )}

          {/* SED note — shown read-only to manager/superadmin */}
          {(role === 'manager' || role === 'superadmin') && task.sedNote && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 space-y-1">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Note from SED</p>
              <p className="text-sm text-blue-900 whitespace-pre-wrap">{task.sedNote}</p>
            </div>
          )}

          {/* Editable fields */}
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
