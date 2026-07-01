'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { Task, TaskUpdateInput, Project } from '@/lib/types'
import TaskList from '@/components/tasks/TaskList'
import ProjectCard from '@/components/projects/ProjectCard'
import ProjectNotesEditor from '@/components/projects/ProjectNotesEditor'
import PaymentTrackerView from '@/components/projects/PaymentTrackerView'
import QuotationModal from '@/components/projects/QuotationModal'
import MaterialOrderModal from '@/components/projects/MaterialOrderModal'
import HandoverModal from '@/components/projects/HandoverModal'
import UnifiedCalendar, { TabDef } from '@/components/calendar/UnifiedCalendar'
import AllMaterialsView from '@/components/materials/AllMaterialsView'
import AssignInstallationModal, { TeamMember } from '@/components/projects/AssignInstallationModal'
import TimesheetsView from '@/components/timesheets/TimesheetsView'
import PayablesView from '@/components/finance/PayablesView'
import ReceivablesView from '@/components/finance/ReceivablesView'
import type { CalendarEvent } from '@/lib/airtable/calendar'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const MGR_CALENDAR_TABS: TabDef[] = [
  { id: 'activity',     label: 'Activity',      dot: 'bg-blue-500',   types: ['activity', 'fabrication'],               canAddEvent: true },
  { id: 'payments',     label: 'Payments',      dot: 'bg-red-400',    types: ['payment-received', 'payment-due'],        noAdd: true },
  { id: 'personal',     label: 'My Activities', dot: 'bg-yellow-400', types: ['personal'], personalMode: true,           canAddEvent: true },
  { id: 'installation', label: 'Installation',  dot: 'bg-purple-500', types: ['installation', 'fabrication', 'delivery'], showInstallAssign: true, canAddEvent: true },
]

export default function MgrDashboard() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view') ?? 'tasks'
  const [assignProject, setAssignProject] = useState<Project | null>(null)
  const [quotationProject, setQuotationProject] = useState<Project | null>(null)
  const [showMaterialModal, setShowMaterialModal] = useState(false)
  const [handoverProject, setHandoverProject] = useState<Project | null>(null)
  const [projectSearch, setProjectSearch] = useState('')


  const { data: taskData, error: taskError, isLoading: taskLoading, mutate: mutateTasks } =
    useSWR<{ tasks: Task[] }>('/api/tasks?role=manager', fetcher, { refreshInterval: 300_000 })

  const { data: projectData, error: projectError, isLoading: projectLoading, mutate: mutateProjects } =
    useSWR<{ projects: Project[] }>(
      view === 'projects' || view === 'payments' || view === 'installation' || view === 'timesheets'
        ? '/api/projects'
        : null,
      fetcher,
      { refreshInterval: 300_000 },
    )

  const { data: teamData, isLoading: teamLoading } = useSWR<{ members: TeamMember[] }>(
    view === 'installation' ? '/api/team/installation' : null,
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

  const tasks = taskData?.tasks ?? []
  const projects = projectData?.projects ?? []
  const projectsApiError = projectData && !Array.isArray(projectData.projects)
    ? (projectData as unknown as { error?: string }).error ?? 'Unknown error'
    : null

  const handleUpdate = async (id: string, fields: Partial<TaskUpdateInput>) => {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })
    if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? 'Update failed') }
    mutateTasks()
  }

  const pendingReview = tasks.filter(t => t.status === 'Pending Approval')
  const open = tasks.filter(t => t.status !== 'Completed')

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Manager Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Project oversight and approvals</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-2 sm:p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-900">{open.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Open Tasks</p>
        </div>
        <div className="bg-white rounded-xl border border-orange-200 p-2 sm:p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-orange-600">{pendingReview.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Awaiting Approval</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-2 sm:p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-900">{projects.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Active Projects</p>
        </div>
      </div>

      {/* Task views */}
      {(view === 'tasks' || view === 'deliveries') && (
        <>
          {view === 'deliveries' && (
            <div className="mb-4 space-y-2">
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
          {taskError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">Failed to load tasks. <button onClick={() => mutateTasks()} className="underline">Retry</button></div>}
          {!taskError && (
            <TaskList
              loading={taskLoading}
              tasks={view === 'deliveries' ? tasks.filter(t => !!t.completionDate) : tasks}
              role="manager"
              onUpdate={handleUpdate}
            />
          )}
        </>
      )}

      {/* Materials view */}
      {view === 'materials' && <AllMaterialsView role="manager" />}

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
            {projectLoading && <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" /></div>}
            {(projectError || projectsApiError) && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                Failed to load projects: {projectsApiError ?? 'network error'}.
                Visit <a href="/api/debug/projects" target="_blank" className="underline font-medium">/api/debug/projects</a> to diagnose.
              </div>
            )}
            {!projectLoading && !projectError && !projectsApiError && (
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
                      <div key={p.id} className="space-y-2">
                        <ProjectCard project={p} showPayments>
                          <div className="pt-2 border-t border-gray-100">
                            <p className="text-xs font-medium text-gray-400 mb-1">Notes</p>
                            <ProjectNotesEditor
                              projectId={p.id}
                              initialNotes={p.managerNotes}
                              editable
                              onSaved={() => mutateProjects()}
                            />
                          </div>
                        </ProjectCard>
                        <div className="flex flex-wrap gap-3 px-1">
                          <button onClick={() => setQuotationProject(p)} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                            F5 — Add Quotation Items
                          </button>
                          <button onClick={() => setShowMaterialModal(true)} className="text-xs text-green-600 hover:text-green-700 font-medium">
                            F3 — Order Materials
                          </button>
                          <button onClick={() => setHandoverProject(p)} className="text-xs text-purple-600 hover:text-purple-700 font-medium">
                            F6 — Handover Sheet
                          </button>
                          <RequestMeasurementButton projectId={p.id} />
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

      {/* Payments view */}
      {view === 'payments' && (
        <>
          {projectLoading && <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" /></div>}
          {!projectLoading && !projectError && (
            <PaymentTrackerView projects={projects} />
          )}
        </>
      )}

      {/* Payment Calendar view */}
      {view === 'calendar' && (
        <UnifiedCalendar tabs={MGR_CALENDAR_TABS} />
      )}

      {/* Installation team view — members with assigned projects */}
      {view === 'installation' && (
        <>
          {(projectLoading || teamLoading) && (
            <div className="flex justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
            </div>
          )}
          {!projectLoading && !teamLoading && !projectError && teamData && (() => {
            const members = teamData.members
            const unassigned = projects.filter(
              (p) => !p.assignedInstallationTeam || p.assignedInstallationTeam.length === 0,
            )
            return (
              <div className="space-y-6">
                {/* Per-member cards */}
                <div className="space-y-3">
                  {members.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-8">No active installation team members found.</p>
                  )}
                  {members.map((member) => {
                    const memberProjects = projects.filter((p) =>
                      p.assignedInstallationTeam?.includes(member.id),
                    )
                    const initials = member.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
                    return (
                      <div key={member.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                        {/* Member header */}
                        <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                              <span className="text-xs font-bold text-violet-700">{initials}</span>
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{member.name}</p>
                              <p className="text-xs text-gray-400">Installation</p>
                            </div>
                          </div>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${memberProjects.length > 0 ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-400'}`}>
                            {memberProjects.length} project{memberProjects.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {/* Assigned projects list */}
                        {memberProjects.length > 0 ? (
                          <div className="divide-y divide-gray-50">
                            {memberProjects.map((p) => (
                              <div key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-800 truncate">{p.projectName}</p>
                                  <p className="text-xs text-gray-400 mt-0.5">{p.projectId} · {p.projectStage}</p>
                                </div>
                                <button
                                  onClick={() => setAssignProject(p)}
                                  className="text-xs text-brand-600 hover:text-brand-700 font-medium shrink-0"
                                >
                                  Edit
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="px-4 py-3">
                            <p className="text-xs text-gray-400 italic">No projects assigned</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Unassigned projects */}
                {unassigned.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                      Unassigned Projects ({unassigned.length})
                    </p>
                    <div className="space-y-2">
                      {unassigned.map((p) => (
                        <div key={p.id} className="bg-white border border-orange-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{p.projectName}</p>
                            <p className="text-xs text-gray-400">{p.projectId} · {p.projectStage}</p>
                          </div>
                          <button
                            onClick={() => setAssignProject(p)}
                            className="text-xs text-brand-600 hover:text-brand-700 font-medium shrink-0"
                          >
                            Assign Team
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </>
      )}

      {/* Timesheets view */}
      {view === 'timesheets' && (
        <TimesheetsView projects={projects} />
      )}

      {/* Payables view */}
      {view === 'payables' && <PayablesView />}

      {/* Receivables view */}
      {view === 'receivables' && <ReceivablesView />}

      {assignProject && (
        <AssignInstallationModal
          project={assignProject}
          members={teamData?.members ?? []}
          onClose={() => setAssignProject(null)}
          onSaved={() => mutateProjects()}
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

      {handoverProject && (
        <HandoverModal
          projectId={handoverProject.id}
          projectName={handoverProject.projectName}
          onClose={() => setHandoverProject(null)}
          onCreated={() => mutateProjects()}
        />
      )}


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
