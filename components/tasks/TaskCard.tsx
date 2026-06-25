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
import F5QuotationPanel from './panels/F5QuotationPanel'
import OrderSamplePanel from './panels/OrderSamplePanel'
import FabricateMissingPanel from './panels/FabricateMissingPanel'
import F2ProductionPanel from './panels/F2ProductionPanel'
import CallClientDecisionPanelComponent from './panels/CallClientDecisionPanel'
import MeasurementTeamPanel from './panels/MeasurementTeamPanel'


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
const FOLLOW_UP_KEYWORD = 'follow up'

const FOLLOW_UP_OUTCOMES = [
  'Reject Project',
  'SED to Follow Up',
  'Manager to Follow Up',
] as const
const DATE_TASK_KEYWORDS = ['site visit', 'visit site', 'installation date', 'fixing date', 'visit date', 'take measurement']
const MEASUREMENT_KEYWORDS = ['take measurement']

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

function isDateRequiredTask(taskName: string): boolean {
  const lower = taskName.toLowerCase()
  return DATE_TASK_KEYWORDS.some((kw) => lower.includes(kw))
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
    () => ({
      ...getInitialFieldValues(task, getEditableFieldsForRole(role)),
      ...(role === 'superadmin' ? { superadminNote: task.superadminNote ?? '' } : {}),
    }),
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [calendarDate, setCalendarDate] = useState(task.taskStartDate ?? '')
  const [calendarSaving, setCalendarSaving] = useState(false)
  const [calendarSaved, setCalendarSaved] = useState(!!task.taskStartDate)
  const [followUpOutcome, setFollowUpOutcome] = useState(task.followUpOutcome ?? '')
  const [followUpNote, setFollowUpNote] = useState(task.superadminNote ?? '')
  const [followUpSaving, setFollowUpSaving] = useState(false)

  // Sync local fields when server data changes, but only when card is closed
  // to avoid overwriting in-progress edits
  useEffect(() => {
    if (!isOpen) {
      setLocalFields(getInitialFieldValues(task, getEditableFieldsForRole(role)))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.lastModified, isOpen])

  // Always sync status from server — the API may route 'Completed' → 'Pending Approval'
  // (manager review) and the dropdown must reflect the real server state
  useEffect(() => {
    setLocalFields((prev) => ({ ...prev, status: task.status }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.status])

  const isMakeQuotation =
    task.pathCondition === 'Make Quotation' ||
    task.taskName.toLowerCase().includes('make quotation')
  const isF4Task = task.taskName.toLowerCase().startsWith('f4 —') || task.taskName.toLowerCase().startsWith('f4 form —')
  const isF5Task = task.taskName.toLowerCase().startsWith('f5 —')
  const isF3Task =
    task.taskName.toLowerCase().startsWith('f3 —') ||
    task.taskName.toLowerCase().includes('order sample material f3')
  const isOrderSample = task.taskName === 'Order Sample' && !task.projectItem?.length
  const isPerItemOrderSample =
    !!task.projectItem?.length &&
    task.pathCondition === 'Select Sample (item)' &&
    !task.taskName.toLowerCase().startsWith('sample branch:')
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

  const isFollowUpTask =
    role === 'superadmin' &&
    task.taskName.toLowerCase().includes(FOLLOW_UP_KEYWORD)

  const isSystemAutoTask =
    task.taskName.toLowerCase().startsWith('to follow tasks progress') ||
    task.taskName.toLowerCase().includes('(auto')

  const ar = isArabicRole(role)
  const urgent = isUrgent(task)
  const isDecisionTask = isCallClientDecisionTask(task, role)
  const isPerItem = !!task.projectItem?.length
  const isMeasurementTask =
    task.taskName.toLowerCase().includes('take measurement') &&
    (!task.pathCondition || isPerItem) &&
    (role === 'manager' || role === 'sed' || role === 'superadmin')
  const isDateTask =
    isDateRequiredTask(task.taskName) &&
    (!task.pathCondition || isPerItem) &&
    !isMeasurementTask &&
    (role === 'manager' || role === 'sed' || role === 'superadmin')

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
      toast.success(hasMaterial ? 'Fabrication notified — sample in progress' : 'Recorded: ordering material')
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

  async function saveFollowUpOutcomeNote() {
    setFollowUpSaving(true)
    try {
      await onUpdate(task.id, {
        ...(followUpOutcome ? { followUpOutcome: followUpOutcome as 'Reject Project' | 'SED to Follow Up' | 'Manager to Follow Up' } : {}),
        superadminNote: followUpNote,
      })
      toast.success('Follow-up saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setFollowUpSaving(false)
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

  async function handleAddToCalendar() {
    if (!calendarDate) {
      toast.error(ar ? 'اختر التاريخ أولاً' : 'Select a date first')
      return
    }
    setCalendarSaving(true)
    try {
      const eventType = MEASUREMENT_KEYWORDS.some((kw) => task.taskName.toLowerCase().includes(kw)) ? 'installation' : 'activity'
      const title = projectLabel
        ? `${task.taskName} — ${projectLabel}`
        : task.taskName
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          date: calendarDate,
          projectId: task.projectRecordId,
          eventType,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      await onUpdate(task.id, { taskStartDate: calendarDate })
      setCalendarSaved(true)
      toast.success(ar ? 'تمت الإضافة للتقويم' : 'Added to calendar')
    } catch {
      toast.error(ar ? 'فشل الحفظ' : 'Failed to add to calendar')
    } finally {
      setCalendarSaving(false)
    }
  }

  function handleChange(key: keyof TaskUpdateInput, value: unknown) {
    if (key === 'status' && value === 'Completed') {
      if (isOrderSample || isPerItemOrderSample) {
        toast.error(ar ? 'استخدم خيار الفرع أدناه' : 'Use the branch selector below to complete')
        return
      }
      if (isAttachDocsTask) {
        toast.error(ar ? 'أرفق المستندات أولاً' : 'Attach all 7 documents first using the panel below')
        return
      }
      if (isChooseInstallTeamTask) {
        toast.error(ar ? 'اختر الفريق أولاً' : 'Choose the installation team using the panel below')
        return
      }
      if (isFixingTeamNoteTask && task.status !== 'Completed') {
        toast.error(ar ? 'استخدم زر إتمام المهمة أدناه' : 'Use the "Complete task" button in the panel below')
        return
      }
      if (isF2ProductionTask && task.status !== 'Completed') {
        toast.error(ar ? 'أدخل التواريخ في اللوحة أدناه' : 'Enter dates in the production panel below')
        return
      }
      if (isF3Task && task.status !== 'Completed') {
        toast.error(ar ? 'استكمل طلب المواد أدناه' : 'Complete the material order in the panel below')
        return
      }
      if (isF5Task && task.status !== 'Completed') {
        toast.error(ar ? 'استكمل بنود الميزانية أدناه' : 'Complete the quotation items in the panel below')
        return
      }
      if (isFabricateMissingTask && task.status !== 'Completed') {
        toast.error(ar ? 'استخدم اللوحة أدناه' : 'Use the panel below to complete or skip')
        return
      }
      if ((isMakeQuotation || isF4Task) && !task.projectQuotationNumber) {
        toast.error(ar ? 'استكمل بيانات العرض أدناه' : 'Complete the quotation details in the panel below')
        return
      }
      if (isDateTask && !calendarSaved) {
        toast.error(ar ? 'أضف التاريخ للتقويم أولاً' : 'Add a date to the calendar first')
        return
      }
    }
    if (isF2ProductionTask && task.status !== 'Completed' && (key === 'plannedProdStartDate' || key === 'expectedFabEndDate')) {
      setLocalFields((prev) => ({ ...prev, [key]: value }))
      return
    }
    if (isF3Task && task.status !== 'Completed' && key === 'status' && value === 'In Progress') return
    if (isF4Task && task.status === 'Completed' && key === 'status') return
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
          <CallClientDecisionPanelComponent
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
          {(isOrderSample || isPerItemOrderSample) && (
            <OrderSamplePanel task={task} onUpdate={onUpdate} />
          )}

          {/* F5 quotation details panel */}
          {isF5Task && task.status !== 'Completed' && (
            <F5QuotationPanel task={task} onUpdate={onUpdate} />
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
          {isFabricateMissingTask && (
            <FabricateMissingPanel task={task} onUpdate={onUpdate} />
          )}


          {/* F2 Production List panel — fabrication date range entry (fabrication role only) */}
          {isF2ProductionTask && ar && (
            <F2ProductionPanel task={task} onUpdate={onUpdate} />
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

          {/* Date picker — site visit / installation scheduling tasks */}
          {isDateTask && (
            <div className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-3 space-y-2">
              <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">
                {ar ? 'تاريخ الزيارة / التركيب' : 'Visit / Installation Date'}
              </p>
              <div className="flex gap-2 items-center flex-wrap">
                <input
                  type="date"
                  value={calendarDate}
                  onChange={(e) => { setCalendarDate(e.target.value); setCalendarSaved(false) }}
                  className="text-sm border border-violet-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
                />
                <button
                  onClick={handleAddToCalendar}
                  disabled={!calendarDate || calendarSaving || calendarSaved}
                  className="text-xs font-medium px-3 py-1.5 rounded-md bg-violet-600 text-white disabled:opacity-40 hover:bg-violet-700 transition-colors"
                >
                  {calendarSaving
                    ? '…'
                    : calendarSaved
                      ? (ar ? '✓ تم الحفظ' : '✓ Saved')
                      : (ar ? 'إضافة للتقويم' : 'Add to Calendar')}
                </button>
              </div>
              <p className="text-[11px] text-violet-500">
                {calendarSaved
                  ? (ar ? 'تم إضافة الموعد — يمكنك الآن إتمام المهمة' : 'Date saved — you can now complete this task')
                  : (ar ? 'سيُضاف لتقويم النشاطات' : 'Will be added to the activity calendar')}
              </p>
            </div>
          )}

          {/* Measurement team picker — assigns installation member + sends notification */}
          {isMeasurementTask && task.status !== 'Completed' && (
            <MeasurementTeamPanel task={task} onUpdate={onUpdate} />
          )}

          {/* Installation user: read-only scheduled date */}
          {task.taskName.toLowerCase().includes('take measurement') && role === 'installation' && task.taskStartDate && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2.5">
              <p className="text-xs font-semibold text-indigo-800">Measurement Scheduled</p>
              <p className="text-xs text-indigo-600 mt-0.5">{task.taskStartDate}</p>
            </div>
          )}

          {/* SED note — shown read-only to manager/superadmin/fabrication */}
          {(role === 'manager' || role === 'superadmin' || role === 'fabrication') && task.sedNote && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 space-y-1">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                {role === 'fabrication' ? 'Stock Check Note' : 'Note from SED'}
              </p>
              <p className="text-sm text-blue-900 whitespace-pre-wrap">{task.sedNote}</p>
            </div>
          )}

          {/* Admin follow-up note — visible to all roles, editable only by superadmin */}
          {task.superadminNote && role !== 'superadmin' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 space-y-1">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">📌 Admin Follow-up Note</p>
              <p className="text-sm text-amber-900 whitespace-pre-wrap">{task.superadminNote}</p>
            </div>
          )}

          {/* Follow-up outcome + note — superadmin only on follow-up tasks */}
          {isFollowUpTask && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-3 space-y-3">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Follow-Up Outcome</p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Outcome</label>
                <select
                  value={followUpOutcome}
                  onChange={(e) => setFollowUpOutcome(e.target.value)}
                  className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="">— select outcome —</option>
                  {FOLLOW_UP_OUTCOMES.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Admin Note</label>
                <textarea
                  value={followUpNote}
                  onChange={(e) => setFollowUpNote(e.target.value)}
                  rows={3}
                  placeholder="Add a follow-up note…"
                  className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
              </div>
              <button
                onClick={saveFollowUpOutcomeNote}
                disabled={followUpSaving}
                className="text-xs font-semibold px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-60 transition-colors"
              >
                {followUpSaving ? 'Saving…' : 'Save Note & Outcome'}
              </button>
            </div>
          )}

          {/* System auto-task — no editable fields, just a status indicator */}
          {isSystemAutoTask ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 flex items-center gap-2">
              <span className="text-gray-400 text-sm">⚡</span>
              <p className="text-xs text-gray-500">
                {task.status === 'Completed'
                  ? 'Completed automatically by the system'
                  : 'Will be completed automatically by the system'}
              </p>
            </div>
          ) : (
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
          )}

          {/* Save state — not shown for system auto tasks */}
          {!isSystemAutoTask && (
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
          )}
        </div>
      )}
    </div>
  )
}
