'use client'

import { useState } from 'react'
import { TaskUpdateInput, Attachment, Role } from '@/lib/types'

interface FieldEditorProps {
  taskId: string
  role: Role
  fields: Partial<TaskUpdateInput>
  onChange: (key: keyof TaskUpdateInput, value: unknown) => void
  onFileUploaded: (fieldKey: string, attachment: { url: string; filename: string }) => void
  existingAttachments: {
    taskDocuments?: Attachment[]
    handoverDocument?: Attachment[]
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
}

const ATTACHMENT_FIELDS: (keyof TaskUpdateInput)[] = [
  'taskDocuments',
  'handoverDocument',
  'fillersAndMissingList',
]

const ATTACHMENT_LABELS: Partial<Record<keyof TaskUpdateInput, string>> = {
  taskDocuments: 'Task Documents',
  handoverDocument: 'Handover Document',
  fillersAndMissingList: 'Fillers & Missing Items List',
}

function UrlAttachmentField({
  label,
  attachments,
  fieldKey,
  onAdd,
}: {
  label: string
  attachments: Attachment[]
  fieldKey: string
  onAdd: (fieldKey: string, att: { url: string; filename: string }) => void
}) {
  const [urlInput, setUrlInput] = useState('')
  const [urlError, setUrlError] = useState('')

  function handleAdd() {
    const trimmed = urlInput.trim()
    if (!trimmed) return
    try {
      new URL(trimmed)
    } catch {
      setUrlError('Please enter a valid URL')
      return
    }
    setUrlError('')
    // Derive a filename from the URL or use a generic label
    const parts = trimmed.split('/').filter(Boolean)
    const filename = decodeURIComponent(parts[parts.length - 1] || 'Link') || 'Link'
    onAdd(fieldKey, { url: trimmed, filename })
    setUrlInput('')
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>

      {attachments.length > 0 && (
        <ul className="space-y-1">
          {attachments.map((att) => (
            <li key={att.id} className="flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              <a
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:underline truncate max-w-xs"
              >
                {att.filename}
              </a>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          type="url"
          placeholder="Paste file link (Google Drive, Dropbox, etc.)"
          value={urlInput}
          onChange={(e) => { setUrlInput(e.target.value); setUrlError('') }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!urlInput.trim()}
          className="text-xs text-brand-600 hover:text-brand-700 disabled:opacity-40 border border-dashed border-brand-300 rounded-md px-3 py-1.5 hover:bg-brand-50 transition-colors whitespace-nowrap"
        >
          Add link
        </button>
      </div>
      {urlError && <p className="text-xs text-red-500">{urlError}</p>}
    </div>
  )
}

export default function FieldEditor({
  taskId,
  fields,
  onChange,
  onFileUploaded,
  existingAttachments,
}: FieldEditorProps) {
  const nonAttachmentFields = Object.keys(fields).filter(
    (k) => !ATTACHMENT_FIELDS.includes(k as keyof TaskUpdateInput),
  ) as (keyof TaskUpdateInput)[]

  const attachmentFieldsPresent = ATTACHMENT_FIELDS.filter((k) => k in fields)

  return (
    <div className="space-y-4">
      {nonAttachmentFields.map((key) => {
        const label = FIELD_LABELS[key] ?? key
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
                <option value="">— select —</option>
                {options.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          )
        }

        if (key === 'managerComment') {
          return (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
              <textarea
                value={(value as string) ?? ''}
                onChange={(e) => onChange(key, e.target.value)}
                rows={3}
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

      {attachmentFieldsPresent.map((key) => (
        <UrlAttachmentField
          key={key}
          label={ATTACHMENT_LABELS[key] ?? String(key)}
          attachments={existingAttachments[key as keyof typeof existingAttachments] ?? []}
          fieldKey={key}
          onAdd={onFileUploaded}
        />
      ))}
    </div>
  )
}
