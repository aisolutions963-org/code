'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { Task, TaskUpdateInput, Project } from '@/lib/types'
import Button from '@/components/ui/Button'
import TaskList from '@/components/tasks/TaskList'
import QuotationModal from '@/components/projects/QuotationModal'
import MaterialOrderModal from '@/components/projects/MaterialOrderModal'
import ProjectNotesEditor from '@/components/projects/ProjectNotesEditor'
import NewProjectModal from '@/components/projects/NewProjectModal'
import CommissionCard from '@/components/sed/CommissionCard'
import AllMaterialsView from '@/components/materials/AllMaterialsView'
import type { CalendarEvent } from '@/lib/airtable/calendar'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function SedDashboard() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view') ?? 'tasks'
  const [showNewProject, setShowNewProject] = useState(false)
  const [quotationProject, setQuotationProject] = useState<Project | null>(null)
  const [showMaterialModal, setShowMaterialModal] = useState(false)
  const [projectSearch, setProjectSearch] = useState('')

  const { data, error, isLoading, mutate } = useSWR<{ tasks: Task[] }>(
    '/api/tasks?role=sed',
    fetcher,
    { refreshInterval: 300_000 },
  )

  const { data: projectData, isLoading: projectLoading, error: projectError, mutate: mutateProjects } =
    useSWR<{ projects: Project[] }>(
      (view === 'projects' || view === 'site-visits') ? '/api/projects' : null,
      fetcher,
      { refreshInterval: 300_000 },
    )

  const { data: calendarData } = useSWR<{ events: CalendarEvent[] }>(
    view === 'deliveries' ? '/api/calendar' : null,
    fetcher,
    { refreshInterval: 300_000 },
  )
  const todayStr = new Date().toISOString().slice(0, 10)
  const upcomingInstallations = (calendarData?.events ?? [])
    .filter((ev) => ev.type === 'installation' && ev.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
  const todayInstallations = upcomingInstallations.filter((ev) => ev.date === todayStr)
  const laterInstallations = upcomingInstallations.filter((ev) => ev.date > todayStr)

  const tasks = data?.tasks ?? []
  const projects = projectData?.projects ?? []

  const handleUpdate = async (id: string, fields: Partial<TaskUpdateInput>) => {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })
    if (!res.ok) {
      const body = await res.json()
      throw new Error(body.error ?? 'Update failed')
    }
    mutate()
  }

  const open = tasks.filter((t) => t.status !== 'Completed')
  const pendingApproval = tasks.filter((t) => t.status === 'Pending Approval')
  const completed = tasks.filter((t) => t.status === 'Completed')

  let visibleTasks = tasks
  if (view === 'approvals') visibleTasks = tasks.filter((t) => {
    const name = t.taskName.toLowerCase()
    const isPending = (name.startsWith('[gate]') || name.includes('take approval from client')) &&
      (t.status === 'To Do' || t.status === 'In Progress')
    const hasOutcome = !!(t.conceptDesignApproval || t.sampleApproval || t.quotationOutcome)
    return isPending || hasOutcome
  })
  if (view === 'site-visits') visibleTasks = tasks.filter((t) =>
    t.taskName.toLowerCase().includes('site visit') || t.taskName.toLowerCase().includes('visit update')
  )
  if (view === 'qc') visibleTasks = tasks.filter((t) => t.qcCheckAtSiteDone !== undefined)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">SED Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Sales, design & client management tasks</p>
        </div>
        <Button onClick={() => setShowNewProject(true)}>+ New Project</Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-900">{open.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Open Tasks</p>
        </div>
        <div className="bg-white rounded-xl border border-orange-200 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-orange-600">{pendingApproval.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Pending Approval</p>
        </div>
        <div className="bg-white rounded-xl border border-green-200 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-green-600">{completed.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Completed</p>
        </div>
        <CommissionCard className="col-span-3" />
      </div>

      {/* Follow-Ups view */}
      {view === 'follow-ups' && <FollowUpsView />}

      {/* Materials view */}
      {view === 'materials' && <AllMaterialsView role="sed" />}

      {/* Deliveries view */}
      {view === 'deliveries' && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Installation Dates</p>
          {upcomingInstallations.length === 0 && (
            <p className="text-sm text-gray-400 py-3 text-center">No upcoming installation dates.</p>
          )}
          {todayInstallations.length > 0 && (
            <>
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest pt-1">Today</p>
              {todayInstallations.map((ev) => (
                <div key={ev.id} className="bg-blue-50 border border-blue-400 rounded-xl px-4 py-3 flex items-start gap-3">
                  <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-blue-200 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800">{ev.title}</p>
                    {ev.projectName && <p className="text-xs text-gray-500 mt-0.5">{ev.projectName}</p>}
                    {ev.notes && <p className="text-xs text-gray-500 mt-0.5">{ev.notes}</p>}
                    {ev.createdBy && <p className="text-[10px] text-gray-400 mt-1">{ev.createdBy}</p>}
                  </div>
                </div>
              ))}
            </>
          )}
          {laterInstallations.length > 0 && (
            <>
              {todayInstallations.length > 0 && <div className="border-t border-gray-100 pt-1" />}
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pt-1">Upcoming</p>
              {laterInstallations.map((ev) => (
                <div key={ev.id} className="bg-white border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3">
                  <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800">{ev.title}</p>
                    {ev.projectName && <p className="text-xs text-gray-500 mt-0.5">{ev.projectName}</p>}
                    {ev.notes && <p className="text-xs text-gray-500 mt-0.5">{ev.notes}</p>}
                    <p className="text-[10px] text-gray-400 mt-1">
                      {new Date(ev.date).toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
                      {ev.createdBy && ` · ${ev.createdBy}`}
                    </p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Task views */}
      {view !== 'projects' && view !== 'site-visits' && view !== 'approvals' && view !== 'materials' && view !== 'deliveries' && view !== 'follow-ups' && (
        <>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              Failed to load tasks. <button onClick={() => mutate()} className="underline">Retry</button>
            </div>
          )}
          {!error && (
            <TaskList loading={isLoading} tasks={visibleTasks} role="sed" onUpdate={handleUpdate} />
          )}
        </>
      )}

      {/* Client Approvals view */}
      {view === 'approvals' && (
        <ClientApprovalsView tasks={visibleTasks} loading={isLoading} onUpdate={handleUpdate} />
      )}

      {/* Site Visits view */}
      {view === 'site-visits' && (
        <SiteVisitsView
          tasks={visibleTasks}
          projects={projects}
          loading={isLoading || projectLoading}
          onUpdate={handleUpdate}
        />
      )}

      {/* Projects view */}
      {view === 'projects' && (() => {
        const q = projectSearch.trim().toLowerCase()
        const visibleProjects = q
          ? projects.filter((p) =>
              p.projectName.toLowerCase().includes(q) ||
              p.clientName.toLowerCase().includes(q) ||
              (p.quotationNumber ?? '').toLowerCase().includes(q) ||
              (p.quotationReference ?? '').toLowerCase().includes(q) ||
              (p.projectId ?? '').toLowerCase().includes(q) ||
              (p.nickname ?? '').toLowerCase().includes(q),
            )
          : projects
        return (
          <>
            {projectLoading && (
              <div className="flex justify-center py-12">
                <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
              </div>
            )}
            {projectError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                Failed to load projects. <button onClick={() => mutateProjects()} className="underline">Retry</button>
              </div>
            )}
            {!projectLoading && !projectError && (
              <>
                <div className="relative mb-4">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
                  </svg>
                  <input
                    type="text"
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    placeholder="Search by project name, client, quotation number…"
                    className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                  />
                  {projectSearch && (
                    <button onClick={() => setProjectSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
                  )}
                </div>
                {visibleProjects.length === 0 ? (
                  <p className="text-center py-10 text-sm text-gray-400">
                    {q ? `No projects match "${projectSearch}"` : 'No active projects found.'}
                  </p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {visibleProjects.map((p) => (
                      <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-gray-400">{p.projectId}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                              {p.projectStage}
                            </span>
                          </div>
                          <p className="font-semibold text-sm text-gray-900">{p.projectName}</p>
                          <p className="text-xs text-gray-500">{p.clientName}</p>
                          {p.quotationNumber && (
                            <p className="font-mono text-xs text-gray-400 mt-0.5">Quotation #{p.quotationNumber}</p>
                          )}
                        </div>
                        <div className="pt-1 border-t border-gray-100">
                          <p className="text-xs font-medium text-gray-400 mb-1">Notes</p>
                          <ProjectNotesEditor
                            projectId={p.id}
                            initialNotes={p.managerNotes}
                            editable
                            onSaved={() => mutateProjects()}
                          />
                        </div>
                        <div className="pt-1 border-t border-gray-100 flex flex-wrap gap-3">
                          <button
                            onClick={() => setQuotationProject(p)}
                            className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                          >
                            F5 — Add Quotation Items
                          </button>
                          <button
                            onClick={() => setShowMaterialModal(true)}
                            className="text-xs text-green-600 hover:text-green-700 font-medium"
                          >
                            F3 — Order Materials
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )
      })()}

      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreated={() => mutate()}
        />
      )}

      {quotationProject && (
        <QuotationModal
          project={quotationProject}
          onClose={() => setQuotationProject(null)}
          onCreated={() => mutateProjects()}
        />
      )}

      {showMaterialModal && (
        <MaterialOrderModal
          projects={projects}
          onClose={() => setShowMaterialModal(false)}
          onCreated={() => setShowMaterialModal(false)}
        />
      )}
    </div>
  )
}

interface FollowUpLog {
  id: string
  quotationId: string
  quotationNumber: string
  clientName: string
  date: string
  method: string
  outcome: string
  nextDate?: string
  doneBy: string
  notes?: string
}

interface QuotationOption {
  id: string
  quoteNumber: string
  clientName: string
}

const METHOD_COLORS: Record<string, string> = {
  Phone:      'bg-blue-100 text-blue-700',
  WhatsApp:   'bg-green-100 text-green-700',
  Email:      'bg-purple-100 text-purple-700',
  'In-Person':'bg-amber-100 text-amber-700',
}
function methodColor(m: string) {
  return METHOD_COLORS[m] ?? 'bg-gray-100 text-gray-500'
}

const EMPTY_FOLLOW_UP_FORM = {
  quotationId: '', date: new Date().toISOString().slice(0, 10),
  method: 'Phone', outcome: '', nextDate: '', notes: '',
}

function FollowUpsView() {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_FOLLOW_UP_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const { data, mutate, isLoading } = useSWR<{ logs: FollowUpLog[]; quotations: QuotationOption[] }>(
    '/api/follow-ups',
    fetcher,
    { refreshInterval: 300_000 },
  )
  const logs = data?.logs ?? []
  const quotations = data?.quotations ?? []

  function setField(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await fetch('/api/follow-ups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quotationId: form.quotationId || undefined,
          date: form.date,
          method: form.method,
          outcome: form.outcome,
          nextDate: form.nextDate || undefined,
          notes: form.notes || undefined,
        }),
      })
      mutate()
      setShowAdd(false)
      setForm(EMPTY_FOLLOW_UP_FORM)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this follow-up?')) return
    setDeleting(id)
    try {
      await fetch(`/api/follow-ups/${id}`, { method: 'DELETE' })
      mutate()
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">My Follow-Ups</h2>
          <p className="text-xs text-gray-400 mt-0.5">{logs.length} log{logs.length !== 1 ? 's' : ''}</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>+ Log Follow-Up</Button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && logs.length === 0 && (
        <p className="text-center py-10 text-sm text-gray-400">No follow-ups logged yet.</p>
      )}

      {!isLoading && logs.length > 0 && (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-semibold text-gray-800 truncate">
                      {log.clientName || log.quotationNumber || '—'}
                    </span>
                    {log.quotationNumber && (
                      <span className="font-mono text-[11px] text-gray-400">#{log.quotationNumber}</span>
                    )}
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${methodColor(log.method)}`}>
                      {log.method}
                    </span>
                  </div>
                  <p className="text-xs text-gray-700">{log.outcome}</p>
                  {log.notes && <p className="text-[11px] text-gray-400 mt-0.5 italic">{log.notes}</p>}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-[11px] text-gray-400">
                      {log.date ? new Date(log.date + 'T00:00:00').toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                    </span>
                    {log.nextDate && (
                      <span className="text-[11px] text-brand-600 font-medium">
                        Next: {new Date(log.nextDate + 'T00:00:00').toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(log.id)}
                  disabled={deleting === log.id}
                  className="shrink-0 text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40 text-base leading-none mt-0.5"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <p className="font-semibold text-gray-900 text-sm">Log Follow-Up</p>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleAdd} className="px-5 py-4 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Quotation</span>
                <select value={form.quotationId} onChange={(e) => setField('quotationId', e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
                  <option value="">— No quotation —</option>
                  {quotations.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.quoteNumber ? `#${q.quoteNumber} — ` : ''}{q.clientName || q.id}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Date *</span>
                  <input required type="date" value={form.date} onChange={(e) => setField('date', e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Method *</span>
                  <select required value={form.method} onChange={(e) => setField('method', e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
                    {['Phone','WhatsApp','Email','In-Person','Other'].map((m) => <option key={m}>{m}</option>)}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Outcome *</span>
                <input required value={form.outcome} onChange={(e) => setField('outcome', e.target.value)}
                  placeholder="What was discussed or decided…"
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Next Follow-Up Date</span>
                <input type="date" value={form.nextDate} onChange={(e) => setField('nextDate', e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Notes</span>
                <textarea rows={2} value={form.notes} onChange={(e) => setField('notes', e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none" />
              </label>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="flex-1 py-2 text-sm rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors">
                  {saving ? 'Saving…' : 'Log Follow-Up'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function ClientApprovalsView({
  tasks,
  loading,
  onUpdate,
}: {
  tasks: Task[]
  loading: boolean
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  const pending = tasks.filter((t) => {
    const name = t.taskName.toLowerCase()
    return (name.startsWith('[gate]') || name.includes('take approval from client')) &&
      (t.status === 'To Do' || t.status === 'In Progress')
  })

  const decided = tasks.filter((t) => t.conceptDesignApproval || t.sampleApproval || t.quotationOutcome)

  if (pending.length === 0 && decided.length === 0) {
    return <p className="text-center py-12 text-sm text-gray-400">No client approval tasks found.</p>
  }

  return (
    <div className="space-y-6">
      {/* Waiting for client */}
      {pending.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <h2 className="text-sm font-semibold text-gray-700">Waiting for Client</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
              {pending.length}
            </span>
          </div>
          <div className="space-y-2">
            {pending.map((t) => (
              <div key={t.id} className="bg-white border border-amber-200 rounded-xl px-4 py-3 flex items-start justify-between gap-3 shadow-sm">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">
                    {t.taskName.replace(/^\[gate\]\s*/i, '')}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {t.projectName ?? t.projectRef ?? ''}
                    {t.projectItemName ? ` › ${t.projectItemName}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  {t.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decisions recorded */}
      {decided.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-gray-400 shrink-0" />
            <h2 className="text-sm font-semibold text-gray-700">Decisions Recorded</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
              {decided.length}
            </span>
          </div>
          <div className="space-y-2">
            {decided.map((t) => (
              <div key={t.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{t.taskName}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {t.projectName ?? t.projectRef ?? ''}
                      {t.projectItemName ? ` › ${t.projectItemName}` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    t.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {t.status}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {t.conceptDesignApproval && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                      Design: {t.conceptDesignApproval}
                    </span>
                  )}
                  {t.sampleApproval && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-100">
                      Sample: {t.sampleApproval}
                    </span>
                  )}
                  {t.quotationOutcome && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                      Quotation: {t.quotationOutcome}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const STATUS_STYLE: Record<string, string> = {
  'To Do':            'bg-blue-100 text-blue-700',
  'In Progress':      'bg-amber-100 text-amber-700',
  'Completed':        'bg-green-100 text-green-700',
  'Pending Approval': 'bg-orange-100 text-orange-700',
  'Locked':           'bg-gray-100 text-gray-400',
}

function SiteVisitsView({
  tasks,
  projects,
  loading,
  onUpdate,
}: {
  tasks: Task[]
  projects: Project[]
  loading: boolean
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}) {
  const projectMap = new Map(projects.map((p) => [p.id, p]))

  // Group tasks by project
  const grouped = new Map<string, { project: Project | null; tasks: Task[] }>()
  for (const t of tasks) {
    const pid = t.projectRecordId ?? t.project?.[0] ?? ''
    if (!grouped.has(pid)) {
      grouped.set(pid, { project: projectMap.get(pid) ?? null, tasks: [] })
    }
    grouped.get(pid)!.tasks.push(t)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (grouped.size === 0) {
    return (
      <div className="text-center py-12 text-sm text-gray-400">
        No site visit tasks found.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {Array.from(grouped.entries()).map(([pid, { project: p, tasks: grpTasks }]) => {
        const locationQuery = [p?.detailedLocation, p?.location, p?.emirate].filter(Boolean).join(', ')
        const mapsUrl = locationQuery
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationQuery)}`
          : null

        return (
          <div key={pid} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {/* Project header */}
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {p?.projectId && (
                    <span className="font-mono text-[11px] text-gray-400">{p.projectId}</span>
                  )}
                  {p?.projectStage && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                      {p.projectStage}
                    </span>
                  )}
                </div>
                <p className="font-semibold text-sm text-gray-900 mt-0.5 truncate">
                  {p?.projectName ?? grpTasks[0]?.projectName ?? 'Unknown Project'}
                </p>
                {p?.clientName && (
                  <p className="text-xs text-gray-500">{p.clientName}</p>
                )}
              </div>
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors border border-blue-200"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Open in Maps
                </a>
              )}
            </div>

            {/* Notes card */}
            {(p?.sedNotes || p?.managerNotes) && (
              <div className="px-4 py-2.5 border-b border-gray-100 bg-amber-50/60 space-y-2">
                {p?.sedNotes && (
                  <div>
                    <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-0.5">My Notes</p>
                    <p className="text-xs text-amber-900 whitespace-pre-wrap leading-relaxed">{p.sedNotes}</p>
                  </div>
                )}
                {p?.managerNotes && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Manager Notes</p>
                    <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{p.managerNotes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Location info */}
            {(p?.emirate || p?.location || p?.detailedLocation) && (
              <div className="px-4 py-2.5 border-b border-gray-100 space-y-1">
                {p?.emirate && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400 w-20 shrink-0">Emirate</span>
                    <span className="font-medium text-gray-700 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-[11px]">
                      {p.emirate}
                    </span>
                  </div>
                )}
                {p?.location && (
                  <div className="flex items-start gap-2 text-xs">
                    <span className="text-gray-400 w-20 shrink-0">Area</span>
                    <span className="text-gray-700">{p.location}</span>
                  </div>
                )}
                {p?.detailedLocation && (
                  <div className="flex items-start gap-2 text-xs">
                    <span className="text-gray-400 w-20 shrink-0">Address</span>
                    <span className="text-gray-600">{p.detailedLocation}</span>
                  </div>
                )}
              </div>
            )}

            {/* Site visit tasks */}
            <div className="divide-y divide-gray-100">
              {grpTasks.map((t) => (
                <div key={t.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{t.taskName}</p>
                    {t.projectItemName && (
                      <p className="text-[11px] text-gray-400 mt-0.5">Item: {t.projectItemName}</p>
                    )}
                    {t.taskStartDate && (
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Scheduled:{' '}
                        {new Date(t.taskStartDate + 'T00:00:00').toLocaleDateString('en-AE', {
                          weekday: 'short', day: 'numeric', month: 'short',
                        })}
                      </p>
                    )}
                    {t.postVisitOutcome && (
                      <p className="text-[11px] text-gray-500 mt-0.5 italic">Outcome: {t.postVisitOutcome}</p>
                    )}
                  </div>
                  <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_STYLE[t.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {t.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

