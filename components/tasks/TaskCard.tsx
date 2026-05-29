'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput, Role, Attachment, DocLink } from '@/lib/types'
import { EDITABLE_FIELDS } from '@/lib/permissions'
import TaskStatusBadge from './TaskStatusBadge'
import FieldEditor from './FieldEditor'
import F3OrderPanel from './panels/F3OrderPanel'
import QuotationPanel from './panels/QuotationPanel'
import AttachDocsPanel from './panels/AttachDocsPanel'
import ChooseInstallTeamPanel from './panels/ChooseInstallTeamPanel'
import FixingTeamNotePanel from './panels/FixingTeamNotePanel'
import F2DeliveryPanel from './panels/F2DeliveryPanel'

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

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
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

const AR_TASK_NAMES: Record<string, string> = {
  'F2 Production List (Time Line & End Date)': 'قائمة الإنتاج F2 — الجدول الزمني ويوم التسليم',
  'Carpentry (item-level)': 'أعمال النجارة (لكل قطعة)',
  'Paint (item-level)': 'أعمال الطلاء (لكل قطعة)',
  '[GATE]Fabrication Done': 'اكتمل التصنيع',
  'Fabricate if Any Missing Item (Between Days — Optional)': 'تصنيع القطع الناقصة (اختياري)',
  'Store Revised Material List (Big Orders Only)': 'حفظ قائمة المواد المعدّلة (للطلبات الكبيرة فقط)',
  'Sample Branch: We Have Material — Send to Fabrication': 'لدينا العينة — إرسال للتصنيع',
  'Sample Branch: We Have Material — Send to Fabrication (per item)': 'لدينا المادة — إرسال للتصنيع (لكل قطعة)',
  'Sample Branch: We Have Material — Fabrication': 'لدينا المادة — ابدأ التصنيع',
  'Supply — Deliver Items to Client Site': 'توريد — تسليم القطع لموقع العميل',
  'Installation Day N (Flexible — Repeats as Needed)': 'يوم التركيب',
  'Handing Over Form — F6 Generated': 'نموذج التسليم — F6',
  'Send to SED & Fixing Team — 2 Days to Check Item & Tools Before Delivery (auto)': 'إرسال لفريق التركيب — يومان للتحقق من القطع والأدوات',
  'Fixing Team Note: How Many Days & Labor Needed to Hand Over the Work': 'ملاحظة فريق التركيب: عدد الأيام والعمالة المطلوبة',
  'How Many Days & Labor Needed to Hand Over the Work': 'ملاحظة فريق التركيب: عدد الأيام والعمالة المطلوبة',
  'Manage: Check Site Status, Give Client Exact Delivery Date & Inform for Payment': 'إدارة: التحقق من الموقع وتأكيد موعد التسليم',
  ' Inform Client of Estimated Date of Supply': 'إبلاغ العميل بالموعد التقديري للتوريد',
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

  // Sync local fields when server data changes, but only when card is closed
  // to avoid overwriting in-progress edits
  useEffect(() => {
    if (!isOpen) {
      setLocalFields(getInitialFieldValues(task, getEditableFieldsForRole(role)))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.lastModified])

  const isMakeQuotation =
    task.pathCondition === 'Make Quotation' ||
    task.taskName.toLowerCase().includes('make quotation')
  const isF4Task = task.taskName.toLowerCase().startsWith('f4 —')
  const isF3Task = task.taskName.toLowerCase().startsWith('f3 —')
  const isOrderSample = task.taskName === 'Order Sample' && !task.projectItem?.length
  const isPerItemOrderSample =
    !!task.projectItem?.length && task.pathCondition === 'Select Sample (item)'
  const isAttachDocsTask = task.taskName.toLowerCase().startsWith('click done: attach 7 items')
  const isChooseInstallTeamTask = task.taskName
    .toLowerCase()
    .startsWith('choose installation team')
  const isF2ProductionTask = task.taskName.toLowerCase().startsWith('f2 production list')
  const isFixingTeamNoteTask =
    task.taskName.toLowerCase().startsWith('fixing team note') ||
    task.taskName.toLowerCase().startsWith('how many days') ||
    task.taskName.toLowerCase().startsWith('installation day')
  const isFabricateMissingTask = task.taskName === 'Fabricate if Any Missing Item (Between Days — Optional)'

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
          setLocalFields((prev) => ({
            ...prev,
            [key]: (task as unknown as Record<string, unknown>)[key],
          }))
        } finally {
          setSaving(false)
        }
      }, 500)
    },
    [onUpdate, task],
  )

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
      setLocalFields((prev) => ({
        ...prev,
        status: hasMaterial ? 'Completed' : 'In Progress',
      }))
      toast.success(hasMaterial ? 'Branch: We have material' : 'Branch: Ordering material')
      await onUpdate(task.id, {})
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  async function skipFabricateMissingTask() {
    setSaving(true)
    try {
      await onUpdate(task.id, { status: 'Completed' })
      toast.success('Skipped — no missing items')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  async function completeF2Task() {
    if (!localFields.plannedProdStartDate || !localFields.expectedFabEndDate) return
    setSaving(true)
    setSaveError('')
    try {
      await onUpdate(task.id, {
        plannedProdStartDate: localFields.plannedProdStartDate,
        expectedFabEndDate: localFields.expectedFabEndDate,
        status: 'Completed',
      })
      toast.success('تم حفظ جدول الإنتاج')
    } catch {
      setSaveError('فشل الحفظ — أعد المحاولة')
      toast.error('فشل الحفظ')
    } finally {
      setSaving(false)
    }
  }

  function handleChange(key: keyof TaskUpdateInput, value: unknown) {
    if ((isOrderSample || isPerItemOrderSample) && key === 'status' && value === 'Completed') return
    if (isAttachDocsTask && key === 'status' && value === 'Completed') return
    if (isChooseInstallTeamTask && key === 'status' && value === 'Completed') return
    if (isFixingTeamNoteTask && task.status !== 'Completed' && key === 'status' && value === 'Completed') return
    if (isF2ProductionTask && task.status !== 'Completed' && key === 'status' && value === 'Completed') return
    if (isF2ProductionTask && task.status !== 'Completed' && (key === 'plannedProdStartDate' || key === 'expectedFabEndDate')) {
      setLocalFields((prev) => ({ ...prev, [key]: value }))
      return
    }
    if (isF3Task && task.status !== 'Completed' && key === 'status' && (value === 'Completed' || value === 'In Progress')) return
    if (isFabricateMissingTask && task.status !== 'Completed' && key === 'status' && value === 'Completed') return

    if (isF4Task && task.status === 'Completed' && key === 'status') return
    if ((isMakeQuotation || isF4Task) && key === 'status' && value === 'Completed') return
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
            <span className="text-sm font-semibold text-gray-900 truncate" dir={ar ? 'rtl' : 'ltr'}>
              {ar ? (AR_TASK_NAMES[task.taskName] ?? task.taskName) : task.taskName}
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
            {task.lastModified && (
              <span className="text-xs text-gray-400" title={new Date(task.lastModified).toLocaleString()}>
                · {relativeTime(task.lastModified)}
              </span>
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
          {/* Instructions */}
          {ar ? (
            (arabicInstructions || instructions) && (
              <div dir="rtl">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">التعليمات</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {arabicInstructions || instructions}
                </p>
              </div>
            )
          ) : (
            <>
              {instructions && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Instructions</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{instructions}</p>
                </div>
              )}
              {arabicInstructions && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Arabic Instructions</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap rtl-text" dir="rtl">
                    {arabicInstructions}
                  </p>
                </div>
              )}
            </>
          )}

          {/* Quotation panel (Make Quotation + F4) */}
          {(isMakeQuotation || isF4Task) && (
            <QuotationPanel
              task={task}
              variant={isF4Task ? 'f4' : 'makeQuotation'}
              onUpdate={onUpdate}
            />
          )}

          {/* Order Sample — branch selector */}
          {(isOrderSample || isPerItemOrderSample) && task.status !== 'Completed' && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-3 space-y-2">
              <p className="text-xs font-semibold text-green-800">
                Sample Branch{' '}
                <span className="font-normal text-green-700">— does the team have the material?</span>
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

          {/* F3 material order panel */}
          {isF3Task && task.status !== 'Completed' && (
            <F3OrderPanel task={task} onUpdate={onUpdate} />
          )}

          {/* Attach 7 docs panel — Phase 2 per-item final step */}
          {isAttachDocsTask && (
            <AttachDocsPanel task={task} onUpdate={onUpdate} />
          )}

          {/* Choose installation team panel — Phase 3 order 39 */}
          {isChooseInstallTeamTask && (
            <ChooseInstallTeamPanel task={task} onUpdate={onUpdate} />
          )}

          {/* Fixing team note — log installation days */}
          {isFixingTeamNoteTask && (
            <FixingTeamNotePanel task={task} onUpdate={onUpdate} />
          )}

          {/* Fabricate if any missing item — skip or proceed */}
          {isFabricateMissingTask && task.status !== 'Completed' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-3 space-y-2">
              <p className="text-xs font-semibold text-amber-800">
                Missing Items Check{' '}
                <span className="font-normal text-amber-700">— are there any items that need fabrication?</span>
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => onUpdate(task.id, { status: 'In Progress' }).catch(() => null)}
                  disabled={saving || task.status === 'In Progress'}
                  className="border border-amber-400 bg-amber-100 text-amber-900 text-xs font-semibold px-3 py-2.5 rounded-lg hover:bg-amber-200 transition-colors disabled:opacity-60 text-left"
                >
                  <div className="font-bold">✓ Yes — Fabricate</div>
                  <div className="font-normal text-amber-700 mt-0.5">
                    {task.status === 'In Progress' ? 'In progress' : 'Start fabrication'}
                  </div>
                </button>
                <button
                  onClick={skipFabricateMissingTask}
                  disabled={saving}
                  className="border border-gray-300 bg-gray-50 text-gray-800 text-xs font-semibold px-3 py-2.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-60 text-left"
                >
                  <div className="font-bold">✗ No — Skip</div>
                  <div className="font-normal text-gray-600 mt-0.5">No missing items, continue</div>
                </button>
              </div>
            </div>
          )}


          {/* F2 Production List panel — fabrication date range entry (fabrication role only) */}
          {isF2ProductionTask && ar && task.status === 'Completed' && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5" dir="rtl">
              <p className="text-xs font-semibold text-green-800 mb-1">✓ تم تسجيل جدول الإنتاج</p>
              {task.plannedProdStartDate && (
                <p className="text-xs text-green-700">بداية التصنيع: {task.plannedProdStartDate}</p>
              )}
              {task.expectedFabEndDate && (
                <p className="text-xs text-green-700">يوم التسليم: {task.expectedFabEndDate}</p>
              )}
            </div>
          )}
          {isF2ProductionTask && ar && task.status !== 'Completed' && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-3 space-y-3" dir="rtl">
              <p className="text-xs font-semibold text-orange-800">جدول الإنتاج — حدّد الفترة الزمنية لهذه القطعة</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">بداية التصنيع</label>
                  <input
                    type="date"
                    value={(localFields.plannedProdStartDate as string) ?? ''}
                    onChange={(e) => handleChange('plannedProdStartDate', e.target.value || undefined)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">يوم التسليم (آخر يوم)</label>
                  <input
                    type="date"
                    value={(localFields.expectedFabEndDate as string) ?? ''}
                    onChange={(e) => handleChange('expectedFabEndDate', e.target.value || undefined)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
              </div>
              <button
                onClick={completeF2Task}
                disabled={!localFields.plannedProdStartDate || !localFields.expectedFabEndDate || saving}
                className="w-full py-2 rounded-lg text-sm font-semibold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'جاري الحفظ…' : '✓ حفظ وإكمال'}
              </button>
            </div>
          )}

          {/* F2 Delivery Date panel — manager/superadmin schedule delivery once fabrication is done */}
          {isF2ProductionTask && (role === 'manager' || role === 'superadmin') && task.status === 'Completed' && (
            <F2DeliveryPanel task={task} onUpdate={onUpdate} />
          )}
          {isF2ProductionTask && (role === 'manager' || role === 'superadmin') && task.status !== 'Completed' && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
              <p className="text-xs text-gray-500">Delivery date can be scheduled once fabrication marks this item as done.</p>
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
            fields={isF2ProductionTask
              ? Object.fromEntries(
                  Object.entries(localFields).filter(
                    ([k]) => k !== 'plannedProdStartDate' && k !== 'expectedFabEndDate',
                  ),
                ) as typeof localFields
              : localFields}
            onChange={handleChange}
            onDocLinkAdded={handleDocLinkAdded}
            onDocLinkRemoved={handleDocLinkRemoved}
            existingAttachments={{
              taskDocuments: task.taskDocuments,
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
