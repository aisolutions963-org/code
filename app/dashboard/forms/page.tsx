'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Task, TaskUpdateInput, GatePass, Project } from '@/lib/types'
import { todayUAE } from '@/lib/dateUtils'
import { useSession } from '@/app/dashboard/layout-client'
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
import GatePassModal from '@/components/projects/GatePassModal'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { triggerPrint } from '@/lib/printGatePass'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const GATE_PASS_ROLES = ['manager', 'superadmin', 'installation'] as const
const CAN_CREATE_GATE_PASS = ['manager', 'superadmin'] as const

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

function GatePassStatusBadge({ status }: { status?: string }) {
  if (!status) return null
  const [bg, text] =
    status === 'Delivered' ? ['bg-green-100 text-green-700', ''] :
    status === 'Pending' ? ['bg-amber-100 text-amber-700', ''] :
    status === 'Cancelled' ? ['bg-red-100 text-red-700', ''] :
    ['bg-gray-100 text-gray-600', '']
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${bg} ${text}`}>
      {status}
    </span>
  )
}

function GatePassCard({ gp, onStatusChange }: { gp: GatePass; onStatusChange: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [updating, setUpdating] = useState(false)
  const deliveryDate = gp.confirmedDeliveryDate ?? gp.estimatedSupplyDate
  const isConfirmed = !!gp.confirmedDeliveryDate

  async function handleStatusChange(status: string) {
    setUpdating(true)
    try {
      await fetch(`/api/gate-passes/${gp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gatePassStatus: status }),
      })
      onStatusChange()
    } finally {
      setUpdating(false)
    }
  }

  function handlePrint(e: React.MouseEvent) {
    e.stopPropagation()
    const pd = gp.printData
    triggerPrint({
      serial: gp.name || gp.id.slice(-8).toUpperCase(),
      projectRef: gp.projectDisplayId,
      projectName: gp.projectName ?? gp.name,
      dateOfIssue: gp.estimatedSupplyDate || todayUAE(),
      ...(pd ? {
        timeOfIssue: pd.timeOfIssue,
        timeAmPm: pd.timeAmPm as 'AM' | 'PM' | undefined,
        passValidity: pd.passValidity,
        driverName: pd.driverName,
        driverIdLicense: pd.driverIdLicense,
        driverContact: pd.driverContact,
        transportCompany: pd.transportCompany,
        vehicleModel: pd.vehicleModel,
        vehiclePlate: pd.vehiclePlate,
        invoiceDoNumber: pd.invoiceDoNumber,
        items: pd.items,
        customerName: pd.customerName,
        deliveryAddress: pd.deliveryAddress,
        customerContact: pd.customerContact,
      } : {
        itemsDescriptionFallback: gp.itemsDescription,
      }),
      companyName: process.env.NEXT_PUBLIC_APP_NAME ?? 'WOODWINGS',
    })
  }

  return (
    <div className="rounded-xl border border-teal-200 overflow-hidden">
      <div className="flex items-center bg-teal-50">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 flex items-center gap-3 px-4 py-3 text-left min-w-0"
        >
          <span className="w-2 h-2 rounded-full shrink-0 bg-teal-400" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {gp.projectName ?? gp.name ?? '—'}
            </p>
            {gp.projectDisplayId && (
              <p className="text-xs text-gray-400 font-mono">{gp.projectDisplayId}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${isConfirmed ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-600'}`}>
              {isConfirmed ? 'Confirmed' : 'Estimated'}
            </span>
            <span className="text-xs text-gray-500 tabular-nums">{deliveryDate}</span>
            <GatePassStatusBadge status={gp.gatePassStatus} />
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
        {/* Print button always visible */}
        <button
          onClick={handlePrint}
          title="Print gate pass"
          className="px-3 py-3 text-teal-600 hover:text-teal-800 hover:bg-teal-100 transition-colors shrink-0 border-l border-teal-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="p-4 border-t border-teal-100 bg-white space-y-3">
          {/* Items */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Items</p>
            {gp.printData?.items?.filter(i => i.description.trim()).length ? (
              <div className="space-y-0.5">
                {gp.printData.items.filter(i => i.description.trim()).map((item, i) => (
                  <p key={i} className="text-sm text-gray-800">
                    {i + 1}. {item.description} — {item.quantity} {item.unit}
                    {item.condition ? <span className="text-gray-400"> ({item.condition})</span> : null}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-800 whitespace-pre-line">{gp.itemsDescription}</p>
            )}
          </div>
          {/* Driver / vehicle details */}
          {gp.printData?.driverName && (
            <div className="grid grid-cols-2 gap-2 text-xs border-t border-gray-100 pt-3">
              {gp.printData.driverName && (
                <div><p className="text-gray-400">Driver</p><p className="font-medium text-gray-700">{gp.printData.driverName}</p></div>
              )}
              {gp.printData.vehiclePlate && (
                <div><p className="text-gray-400">Plate</p><p className="font-medium text-gray-700">{gp.printData.vehiclePlate}</p></div>
              )}
              {gp.printData.vehicleModel && (
                <div><p className="text-gray-400">Vehicle</p><p className="font-medium text-gray-700">{gp.printData.vehicleModel}</p></div>
              )}
              {gp.printData.transportCompany && (
                <div><p className="text-gray-400">Transport Co.</p><p className="font-medium text-gray-700">{gp.printData.transportCompany}</p></div>
              )}
              {gp.printData.customerName && (
                <div><p className="text-gray-400">Customer</p><p className="font-medium text-gray-700">{gp.printData.customerName}</p></div>
              )}
              {gp.printData.deliveryAddress && (
                <div className="col-span-2"><p className="text-gray-400">Delivery Address</p><p className="font-medium text-gray-700">{gp.printData.deliveryAddress}</p></div>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-gray-400">Estimated Supply</p>
              <p className="font-medium text-gray-700">{gp.estimatedSupplyDate}</p>
            </div>
            {gp.confirmedDeliveryDate && (
              <div>
                <p className="text-gray-400">Confirmed Delivery</p>
                <p className="font-medium text-teal-700">{gp.confirmedDeliveryDate}</p>
              </div>
            )}
          </div>
          {(gp.siteReady !== undefined || gp.clientNotified !== undefined) && (
            <div className="flex gap-3 text-xs">
              {gp.siteReady !== undefined && (
                <span className={`px-2 py-0.5 rounded-full ${gp.siteReady ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {gp.siteReady ? 'Site ready' : 'Site not ready'}
                </span>
              )}
              {gp.clientNotified !== undefined && (
                <span className={`px-2 py-0.5 rounded-full ${gp.clientNotified ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {gp.clientNotified ? 'Client notified' : 'Client not notified'}
                </span>
              )}
            </div>
          )}

          {/* Status update actions */}
          {gp.gatePassStatus !== 'Delivered' && gp.gatePassStatus !== 'Cancelled' && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => handleStatusChange('Delivered')}
                disabled={updating}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors"
              >
                Mark Delivered
              </button>
              <button
                onClick={() => handleStatusChange('Cancelled')}
                disabled={updating}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function FormsPage() {
  const { role } = useSession()

  const { data, isLoading, error, mutate } = useSWR<{ tasks: Task[] }>('/api/tasks', fetcher, {
    refreshInterval: 300_000,
  })

  const showGatePasses = (GATE_PASS_ROLES as readonly string[]).includes(role)
  const canCreateGatePass = (CAN_CREATE_GATE_PASS as readonly string[]).includes(role)

  const { data: gpData, isLoading: gpLoading, mutate: mutateGp } = useSWR<{ gatePasses: GatePass[] }>(
    showGatePasses ? '/api/gate-passes' : null,
    fetcher,
    { refreshInterval: 300_000 },
  )
  const gatePasses = gpData?.gatePasses ?? []

  const [showProjectPicker, setShowProjectPicker] = useState(false)
  const [pickerProjectId, setPickerProjectId] = useState('')
  const [gatePassProject, setGatePassProject] = useState<Project | null>(null)
  const [projectsNeeded, setProjectsNeeded] = useState(false)

  const { data: projectData } = useSWR<{ projects: Project[] }>(
    projectsNeeded ? '/api/projects' : null,
    fetcher,
  )
  const projects = projectData?.projects ?? []

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

  function openGatePassPicker() {
    setProjectsNeeded(true)
    setPickerProjectId('')
    setShowProjectPicker(true)
  }

  function confirmProjectPicker() {
    const proj = projects.find((p) => p.id === pickerProjectId) ?? null
    setGatePassProject(proj)
    setShowProjectPicker(false)
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
            onClick={() => { mutate(); mutateGp() }}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white border border-gray-200 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Gate Passes section */}
        {showGatePasses && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <h2 className="text-sm font-semibold text-gray-700">
                  Gate Passes
                  {!gpLoading && gatePasses.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-gray-400">{gatePasses.length}</span>
                  )}
                </h2>
              </div>
              {canCreateGatePass && (
                <button
                  onClick={openGatePassPicker}
                  className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-1 font-medium"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Gate Pass
                </button>
              )}
            </div>

            {gpLoading && (
              <div className="flex justify-center py-6">
                <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!gpLoading && gatePasses.length === 0 && (
              <div className="rounded-xl border border-dashed border-teal-200 px-4 py-6 text-center">
                <p className="text-sm text-gray-400">No gate passes yet</p>
                {canCreateGatePass && (
                  <p className="text-xs text-gray-300 mt-1">Use the button above to create one for a project delivery</p>
                )}
              </div>
            )}

            {!gpLoading && gatePasses.map((gp) => (
              <GatePassCard key={gp.id} gp={gp} onStatusChange={() => mutateGp()} />
            ))}
          </div>
        )}

        {/* Divider between sections when both are visible */}
        {showGatePasses && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">Task Forms</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
        )}

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

      {/* Project picker for gate pass */}
      <Modal
        open={showProjectPicker}
        onClose={() => setShowProjectPicker(false)}
        title="New Gate Pass — Select Project"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowProjectPicker(false)}>Cancel</Button>
            <Button disabled={!pickerProjectId} onClick={confirmProjectPicker}>Continue</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Select the project this gate pass is for.</p>
          {projects.length === 0 ? (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              value={pickerProjectId}
              onChange={(e) => setPickerProjectId(e.target.value)}
            >
              <option value="">Select project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.projectId} — {p.projectName}
                </option>
              ))}
            </select>
          )}
        </div>
      </Modal>

      {/* Gate Pass creation form */}
      {gatePassProject && (
        <GatePassModal
          project={gatePassProject}
          onClose={() => setGatePassProject(null)}
          onCreated={() => { setGatePassProject(null); mutateGp() }}
        />
      )}
    </div>
  )
}
