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

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function SedDashboard() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view') ?? 'tasks'
  const [showNewProject, setShowNewProject] = useState(false)
  const [quotationProject, setQuotationProject] = useState<Project | null>(null)
  const [showMaterialModal, setShowMaterialModal] = useState(false)

  const { data, error, isLoading, mutate } = useSWR<{ tasks: Task[] }>(
    '/api/tasks?role=sed',
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true },
  )

  const { data: projectData, isLoading: projectLoading, error: projectError, mutate: mutateProjects } =
    useSWR<{ projects: Project[] }>(
      (view === 'projects' || view === 'site-visits') ? '/api/projects' : null,
      fetcher,
      { refreshInterval: 30000, revalidateOnFocus: true },
    )

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
  if (view === 'approvals') visibleTasks = tasks.filter((t) => t.conceptDesignApproval || t.sampleApproval || t.quotationOutcome)
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
      </div>

      {/* Task views */}
      {view !== 'projects' && view !== 'site-visits' && (
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
      {view === 'projects' && (
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
            <div className="grid gap-4 sm:grid-cols-2">
              {projects.map((p) => (
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
                    <RequestMeasurementButton projectId={p.id} />
                  </div>
                </div>
              ))}
              {projects.length === 0 && (
                <p className="col-span-2 text-center py-10 text-sm text-gray-400">No active projects found.</p>
              )}
            </div>
          )}
        </>
      )}

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

function RequestMeasurementButton({ projectId }: { projectId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error' | 'exists'>('idle')

  async function request() {
    setState('loading')
    try {
      const res = await fetch(`/api/projects/${projectId}/request-measurement`, { method: 'POST' })
      if (res.status === 409) { setState('exists'); return }
      if (!res.ok) throw new Error()
      setState('done')
    } catch {
      setState('error')
    }
  }

  if (state === 'done') return <span className="text-xs text-green-600 font-medium">✓ Measurement requested</span>
  if (state === 'exists') return <span className="text-xs text-gray-400 font-medium">Measurement already requested</span>
  if (state === 'error') return <span className="text-xs text-red-500 font-medium">Failed — <button onClick={request} className="underline">retry</button></span>

  return (
    <button
      onClick={request}
      disabled={state === 'loading'}
      className="text-xs text-indigo-600 hover:text-indigo-700 font-medium disabled:opacity-50"
    >
      {state === 'loading' ? 'Requesting…' : '📐 Request Measurements'}
    </button>
  )
}
