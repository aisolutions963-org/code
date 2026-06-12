'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Task, TaskUpdateInput } from '@/lib/types'
import F3OrderPanel from '@/components/tasks/panels/F3OrderPanel'
import F5QuotationPanel from '@/components/tasks/panels/F5QuotationPanel'
import QuotationPanel from '@/components/tasks/panels/QuotationPanel'
import AttachDocsPanel from '@/components/tasks/panels/AttachDocsPanel'
import ChooseInstallTeamPanel from '@/components/tasks/panels/ChooseInstallTeamPanel'
import FixingTeamNotePanel from '@/components/tasks/panels/FixingTeamNotePanel'
import F2DeliveryPanel from '@/components/tasks/panels/F2DeliveryPanel'
import F2ProductionPanel from '@/components/tasks/panels/F2ProductionPanel'
import OrderSamplePanel from '@/components/tasks/panels/OrderSamplePanel'
import FabricateMissingPanel from '@/components/tasks/panels/FabricateMissingPanel'
import CallClientDecisionPanel from '@/components/tasks/panels/CallClientDecisionPanel'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type FormType =
  | 'f5' | 'f4' | 'f3' | 'makeQuotation'
  | 'attachDocs' | 'chooseInstallTeam' | 'fixingTeamNote'
  | 'f2Production' | 'f2Delivery' | 'orderSample' | 'fabricateMissing'
  | 'callClient'

function detectFormType(task: Task): FormType | null {
  const name = task.taskName.toLowerCase()
  if (name.startsWith('f5 —')) return 'f5'
  if (name.startsWith('f4 —')) return 'f4'
  if (name.startsWith('f3 —')) return 'f3'
  if (name.includes('make quotation') || task.pathCondition === 'Make Quotation') return 'makeQuotation'
  if (name.startsWith('click done: attach 7 items')) return 'attachDocs'
  if (name.startsWith('choose installation team')) return 'chooseInstallTeam'
  if (name.startsWith('fixing team note') || name.startsWith('how many days') || name.startsWith('installation day')) return 'fixingTeamNote'
  if (name.startsWith('f2 production list')) return 'f2Production'
  if (name === 'order sample' || (!!task.projectItem?.length && task.pathCondition === 'Select Sample (item)')) return 'orderSample'
  if (task.taskName === 'Fabricate if Any Missing Item (Between Days — Optional)') return 'fabricateMissing'
  if (name.includes('call the client')) return 'callClient'
  return null
}

const FORM_META: Record<FormType, { label: string; dot: string; badge: string; border: string; bg: string }> = {
  f5:             { label: 'F5 — Quotation Details',     dot: 'bg-blue-400',    badge: 'bg-blue-100 text-blue-700',    border: 'border-blue-200',    bg: 'bg-blue-50' },
  f4:             { label: 'F4 — Advance Payment',       dot: 'bg-orange-400',  badge: 'bg-orange-100 text-orange-700', border: 'border-orange-200',  bg: 'bg-orange-50' },
  f3:             { label: 'F3 — Material Order',        dot: 'bg-emerald-400', badge: 'bg-emerald-100 text-emerald-700', border: 'border-emerald-200', bg: 'bg-emerald-50' },
  makeQuotation:  { label: 'Make Quotation',             dot: 'bg-orange-400',  badge: 'bg-orange-100 text-orange-700', border: 'border-orange-200',  bg: 'bg-orange-50' },
  attachDocs:     { label: 'Attach Documents',           dot: 'bg-purple-400',  badge: 'bg-purple-100 text-purple-700', border: 'border-purple-200',  bg: 'bg-purple-50' },
  chooseInstallTeam: { label: 'Choose Install Team',     dot: 'bg-cyan-400',    badge: 'bg-cyan-100 text-cyan-700',    border: 'border-cyan-200',    bg: 'bg-cyan-50' },
  fixingTeamNote: { label: 'Installation Day Log',       dot: 'bg-indigo-400',  badge: 'bg-indigo-100 text-indigo-700', border: 'border-indigo-200',  bg: 'bg-indigo-50' },
  f2Production:   { label: 'F2 — Production Schedule',  dot: 'bg-amber-400',   badge: 'bg-amber-100 text-amber-700',  border: 'border-amber-200',   bg: 'bg-amber-50' },
  f2Delivery:     { label: 'F2 — Schedule Delivery',    dot: 'bg-amber-400',   badge: 'bg-amber-100 text-amber-700',  border: 'border-amber-200',   bg: 'bg-amber-50' },
  orderSample:    { label: 'Order Sample',               dot: 'bg-green-400',   badge: 'bg-green-100 text-green-700',  border: 'border-green-200',   bg: 'bg-green-50' },
  fabricateMissing: { label: 'Fabricate Missing Items',  dot: 'bg-amber-400',   badge: 'bg-amber-100 text-amber-700',  border: 'border-amber-200',   bg: 'bg-amber-50' },
  callClient:     { label: 'Call Client — Outcome',     dot: 'bg-gray-400',    badge: 'bg-gray-100 text-gray-700',    border: 'border-gray-200',    bg: 'bg-gray-50' },
}

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

interface FormCardProps {
  task: Task
  formType: FormType
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

function FormCard({ task, formType, onUpdate }: FormCardProps) {
  const [expanded, setExpanded] = useState(true)
  const m = FORM_META[formType]

  return (
    <div className={`rounded-xl border ${m.border} overflow-hidden`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`w-full flex items-center justify-between px-4 py-3 ${m.bg} text-left`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${m.dot}`} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {task.projectName ?? task.projectRef ?? '—'}
            </p>
            {task.projectItemName && (
              <p className="text-xs text-gray-400 truncate">{task.projectItemName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${m.badge}`}>
            {m.label}
          </span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="p-4 border-t border-gray-100 bg-white space-y-1">
          <p className="text-xs text-gray-400 mb-3 truncate">{task.taskName}</p>
          {formType === 'f5' && <F5QuotationPanel task={task} onUpdate={onUpdate} />}
          {formType === 'f4' && <QuotationPanel task={task} variant="f4" onUpdate={onUpdate} />}
          {formType === 'f3' && <F3OrderPanel task={task} onUpdate={onUpdate} />}
          {formType === 'makeQuotation' && <QuotationPanel task={task} variant="makeQuotation" onUpdate={onUpdate} />}
          {formType === 'attachDocs' && <AttachDocsPanel task={task} onUpdate={onUpdate} />}
          {formType === 'chooseInstallTeam' && <ChooseInstallTeamPanel task={task} onUpdate={onUpdate} />}
          {formType === 'fixingTeamNote' && <FixingTeamNotePanel task={task} onUpdate={onUpdate} />}
          {formType === 'f2Production' && <F2ProductionPanel task={task} onUpdate={onUpdate} />}
          {formType === 'f2Delivery' && <F2DeliveryPanel task={task} onUpdate={onUpdate} />}
          {formType === 'orderSample' && <OrderSamplePanel task={task} onUpdate={onUpdate} />}
          {formType === 'fabricateMissing' && <FabricateMissingPanel task={task} onUpdate={onUpdate} />}
          {formType === 'callClient' && (
            <CallClientDecisionPanel taskId={task.id} onDecided={() => onUpdate(task.id, {})} />
          )}
        </div>
      )}
    </div>
  )
}

export default function FormsPage() {
  const { data, isLoading, error, mutate } = useSWR<{ tasks: Task[] }>('/api/tasks', fetcher, {
    refreshInterval: 300_000,
  })

  const allTasks = data?.tasks ?? []

  const formTasks: { task: Task; formType: FormType }[] = allTasks
    .filter((t) => t.status !== 'Completed')
    .flatMap((t) => {
      const ft = detectFormType(t)
      return ft ? [{ task: t, formType: ft }] : []
    })

  const f2DeliveryTasks: { task: Task; formType: FormType }[] = allTasks
    .filter((t) => {
      const name = t.taskName.toLowerCase()
      return name.startsWith('f2 production list') && t.status === 'Completed'
    })
    .map((t) => ({ task: t, formType: 'f2Delivery' as FormType }))

  const allFormTasks = [...formTasks, ...f2DeliveryTasks]

  async function handleUpdate(id: string, fields: Partial<TaskUpdateInput>) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error((d as { error?: string }).error ?? 'Failed')
    }
    mutate()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Forms</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {isLoading ? 'Loading…' : `${allFormTasks.length} pending form${allFormTasks.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={() => mutate()}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white border border-gray-200 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Task Forms section */}
        {isLoading && <Spinner />}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            Failed to load forms.{' '}
            <button onClick={() => mutate()} className="underline">Retry</button>
          </div>
        )}

        {!isLoading && !error && allFormTasks.length === 0 && (
          <div className="text-center py-16">
            <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-700">No pending forms</p>
            <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
              Forms appear here when projects need quotations, material orders, advance payments, or installation scheduling.
            </p>
            {allTasks.length > 0 && (
              <p className="text-[11px] text-gray-300 mt-3">{allTasks.length} task{allTasks.length !== 1 ? 's' : ''} checked — none require form input right now</p>
            )}
          </div>
        )}

        {!isLoading && allFormTasks.map(({ task, formType }) => (
          <FormCard key={`${task.id}-${formType}`} task={task} formType={formType} onUpdate={handleUpdate} />
        ))}
      </div>

    </div>
  )
}
