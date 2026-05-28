'use client'

import { useState } from 'react'
import { TaskUpdateInput, Attachment, Role, DocLink } from '@/lib/types'

interface FieldEditorProps {
  taskId: string
  role: Role
  fields: Partial<TaskUpdateInput>
  onChange: (key: keyof TaskUpdateInput, value: unknown) => void
  onDocLinkAdded: (fieldKey: string, link: DocLink) => void
  onDocLinkRemoved: (fieldKey: string, index: number) => void
  existingAttachments: {
    taskDocuments?: Attachment[]
    fillersAndMissingList?: Attachment[]
  }
}

const SELECT_OPTIONS: Partial<Record<keyof TaskUpdateInput, string[]>> = {
  status: ['To Do', 'In Progress', 'Completed'],
  managerReviewStatus: ['Not Needed', 'Pending', 'Approved', 'Rejected'],
  postVisitOutcome: ['Make Quotation', 'Need More Details', 'Order Sample', 'Draft Proposal'],
  fabricationPath: ['Carpentry', 'Paint', 'Carpentry + Paint'],
  postCarpentryPath: ['Paint', 'Done', 'Purchase Missing Items'],
  conceptDesignApproval: ['Pending', 'Approved', 'Rejected'],
  sampleApproval: ['Pending', 'Approved', 'Rejected'],
  quotationOutcome: ['Accepted', 'Rejected', 'Negotiating'],
}

const FIELD_LABELS: Partial<Record<keyof TaskUpdateInput, string>> = {
  status: 'Status',
  managerReviewStatus: 'Manager Review Status',
  managerComment: 'Manager Comment',
  sedNote: 'Note for Manager',
  postVisitOutcome: 'Post-Visit Outcome',
  taskStartDate: 'Start Date',
  completionDate: 'Completion Date',
  teamDaysRequired: 'Team Days Required',
  noOfLaborsPerDay: 'No. of Labors / Day',
  installationDays: 'Installation Days',
  plannedProdStartDate: 'Planned Production Start',
  expectedFabEndDate: 'Expected Fabrication End',
  fabricationPath: 'Fabrication Path',
  postCarpentryPath: 'Post-Carpentry Path',
  productionStartPath: 'Production Start Path',
  conceptDesignApproval: 'Concept Design Approval',
  sampleApproval: 'Sample Approval',
  quotationOutcome: 'Quotation Outcome',
  qcCheckAtSiteDone: 'QC Check @ Site Done',
  fillersDone: 'Fillers Done',
  requiresManagerReviewManually: 'Requires Manager Review',
  priorityFlag: 'Priority Flag',
  taskDocLinks: 'Task Documents',
  fillersDocLinks: 'Fillers & Missing Items List',
}

const FIELD_LABELS_AR: Partial<Record<keyof TaskUpdateInput, string>> = {
  status: 'الحالة',
  completionDate: 'تاريخ الانتهاء',
  teamDaysRequired: 'أيام الفريق',
  noOfLaborsPerDay: 'عدد العمال / يوم',
  installationDays: 'أيام التركيب',
  plannedProdStartDate: 'بداية الإنتاج',
  expectedFabEndDate: 'نهاية التصنيع',
  fabricationPath: 'مسار التصنيع',
  postCarpentryPath: 'مسار ما بعد النجارة',
  qcCheckAtSiteDone: 'فحص الجودة في الموقع',
  fillersDone: 'تم الفيلر',
  taskDocLinks: 'مستندات المهمة',
  fillersDocLinks: 'قائمة الفيلر والمواد الناقصة',
}

const OPTION_LABELS_AR: Partial<Record<string, string>> = {
  'To Do': 'للتنفيذ',
  'In Progress': 'قيد التنفيذ',
  'Completed': 'مكتمل',
  'Carpentry': 'نجارة',
  'Paint': 'دهان',
  'Carpentry + Paint': 'نجارة + دهان',
  'Done': 'مكتمل',
  'Purchase Missing Items': 'شراء مواد ناقصة',
}

const DOC_LINK_FIELDS: (keyof TaskUpdateInput)[] = [
  'taskDocLinks',
  'fillersDocLinks',
]

function DocLinksField({
  label,
  links,
  fieldKey,
  onAdd,
  onRemove,
  ar = false,
}: {
  label: string
  links: DocLink[]
  fieldKey: string
  onAdd: (fieldKey: string, link: DocLink) => void
  onRemove: (fieldKey: string, index: number) => void
  ar?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [labelInput, setLabelInput] = useState('')
  const [notesInput, setNotesInput] = useState('')
  const [urlError, setUrlError] = useState('')

  function handleAdd() {
    const trimUrl = urlInput.trim()
    const trimLabel = labelInput.trim()
    if (!trimUrl || !trimLabel) return
    try {
      new URL(trimUrl)
    } catch {
      setUrlError(ar ? 'يرجى إدخال رابط صحيح' : 'Please enter a valid URL')
      return
    }
    setUrlError('')
    onAdd(fieldKey, { url: trimUrl, label: trimLabel, notes: notesInput.trim() || undefined })
    setUrlInput('')
    setLabelInput('')
    setNotesInput('')
    setExpanded(false)
  }

  return (
    <div className="space-y-2" dir={ar ? 'rtl' : 'ltr'}>
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>

      {links.length > 0 && (
        <ul className="space-y-1.5">
          {links.map((link, i) => (
            <li key={i} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <div className="flex items-start gap-2">
                <svg className="w-3.5 h-3.5 text-brand-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <div className="flex-1 min-w-0">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-brand-600 hover:underline font-medium truncate block"
                  >
                    {link.label}
                  </a>
                  {link.notes && (
                    <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{link.notes}</p>
                  )}
                </div>
                <button
                  onClick={() => onRemove(fieldKey, i)}
                  className="text-gray-300 hover:text-red-400 transition-colors shrink-0 p-0.5"
                  title="Remove"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full text-left text-xs text-brand-600 hover:text-brand-700 border border-dashed border-brand-300 rounded-lg px-3 py-2 hover:bg-brand-50 transition-colors"
        >
          {ar ? '+ إضافة رابط' : '+ Add link'}
        </button>
      ) : (
        <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
          <div>
            <label className="text-xs text-gray-500 block mb-1">{ar ? 'الاسم *' : 'Label *'}</label>
            <input
              type="text"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              placeholder={ar ? 'مثال: صور الموقع' : 'e.g. Site photos, Measurement sheet'}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">{ar ? 'الرابط *' : 'URL *'}</label>
            <input
              type="url"
              value={urlInput}
              onChange={(e) => { setUrlInput(e.target.value); setUrlError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
              placeholder="https://drive.google.com/..."
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {urlError && <p className="text-xs text-red-500 mt-1">{urlError}</p>}
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">{ar ? 'ملاحظات' : 'Notes'}</label>
            <textarea
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              placeholder={ar ? 'ملاحظة اختيارية…' : 'Optional notes…'}
              rows={2}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={!urlInput.trim() || !labelInput.trim()}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 transition-colors"
            >
              {ar ? 'إضافة' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => { setExpanded(false); setUrlError('') }}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
            >
              {ar ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function FieldEditor({
  taskId,
  role,
  fields,
  onChange,
  onDocLinkAdded,
  onDocLinkRemoved,
  existingAttachments,
}: FieldEditorProps) {
  const ar = role === 'installation' || role === 'fabrication'
  const labels = ar ? { ...FIELD_LABELS, ...FIELD_LABELS_AR } : FIELD_LABELS

  const nonDocLinkFields = Object.keys(fields).filter(
    (k) => !DOC_LINK_FIELDS.includes(k as keyof TaskUpdateInput),
  ) as (keyof TaskUpdateInput)[]

  const docLinkFieldsPresent = DOC_LINK_FIELDS.filter((k) => k in fields)

  // Old attachment fields (read-only, backward compat)
  const oldAttachmentMap: Record<string, Attachment[] | undefined> = {
    taskDocLinks: existingAttachments.taskDocuments,
    fillersDocLinks: existingAttachments.fillersAndMissingList,
  }

  return (
    <div className="space-y-4">
      {nonDocLinkFields.map((key) => {
        const label = labels[key] ?? key
        const value = fields[key]
        const options = SELECT_OPTIONS[key]

        if (options) {
          return (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {label}
              </label>
              <select
                value={(value as string) ?? ''}
                onChange={(e) => onChange(key, e.target.value || undefined)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-white"
              >
                <option value="">{ar ? '— اختر —' : '— select —'}</option>
                {options.map((opt) => (
                  <option key={opt} value={opt}>{ar ? (OPTION_LABELS_AR[opt] ?? opt) : opt}</option>
                ))}
              </select>
            </div>
          )
        }

        if (key === 'managerComment' || key === 'sedNote') {
          return (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{labels[key] ?? key}</label>
              <textarea
                value={(value as string) ?? ''}
                onChange={(e) => onChange(key, e.target.value)}
                rows={3}
                placeholder={key === 'sedNote' ? 'Leave a note visible to the manager…' : undefined}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              />
            </div>
          )
        }

        if (
          key === 'taskStartDate' ||
          key === 'completionDate' ||
          key === 'plannedProdStartDate' ||
          key === 'expectedFabEndDate'
        ) {
          return (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
              <input
                type="date"
                value={(value as string) ?? ''}
                onChange={(e) => onChange(key, e.target.value || undefined)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )
        }

        if (
          key === 'teamDaysRequired' ||
          key === 'noOfLaborsPerDay' ||
          key === 'installationDays'
        ) {
          return (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
              <input
                type="number"
                min={0}
                value={(value as number) ?? ''}
                onChange={(e) =>
                  onChange(key, e.target.value === '' ? undefined : Number(e.target.value))
                }
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )
        }

        if (
          key === 'qcCheckAtSiteDone' ||
          key === 'fillersDone' ||
          key === 'requiresManagerReviewManually' ||
          key === 'priorityFlag'
        ) {
          return (
            <div key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`field-${taskId}-${key}`}
                checked={(value as boolean) ?? false}
                onChange={(e) => onChange(key, e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
              />
              <label
                htmlFor={`field-${taskId}-${key}`}
                className="text-sm text-gray-700 cursor-pointer"
              >
                {label}
              </label>
            </div>
          )
        }

        return null
      })}

      {docLinkFieldsPresent.map((key) => {
        const sectionLabel = (ar ? FIELD_LABELS_AR[key] : FIELD_LABELS[key]) ?? String(key)
        const links = (fields[key] as DocLink[]) ?? []
        const oldAttachments = oldAttachmentMap[key] ?? []

        return (
          <div key={key} className="space-y-2">
            {/* Show old Airtable attachments read-only if any exist */}
            {oldAttachments.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                  {sectionLabel} (uploaded files)
                </span>
                <ul className="space-y-1">
                  {oldAttachments.map((att) => (
                    <li key={att.id} className="flex items-center gap-2 text-sm">
                      <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      <a href={att.url} target="_blank" rel="noopener noreferrer"
                        className="text-brand-600 hover:underline truncate max-w-xs">
                        {att.filename}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <DocLinksField
              label={sectionLabel}
              links={links}
              fieldKey={key}
              onAdd={onDocLinkAdded}
              onRemove={onDocLinkRemoved}
              ar={ar}
            />
          </div>
        )
      })}
    </div>
  )
}
