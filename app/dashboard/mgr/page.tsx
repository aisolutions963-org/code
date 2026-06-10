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
import MaterialsReviewView from '@/components/projects/MaterialsReviewView'
import AssignInstallationModal, { TeamMember } from '@/components/projects/AssignInstallationModal'
import TimesheetsView from '@/components/timesheets/TimesheetsView'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const MGR_CALENDAR_TABS: TabDef[] = [
  { id: 'activity',     label: 'Activity',     dot: 'bg-amber-400',  types: ['activity', 'fabrication'],                    canAddEvent: true },
  { id: 'payments',     label: 'Payments',     dot: 'bg-green-500',  types: ['payment-received', 'payment-due', 'delivery'], noAdd: true },
  { id: 'installation', label: 'Installation', dot: 'bg-blue-500',   types: ['installation', 'fabrication', 'delivery'],    showInstallAssign: true, canAddEvent: true },
]

export default function MgrDashboard() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view') ?? 'tasks'
  const [assignProject, setAssignProject] = useState<Project | null>(null)
  const [quotationProject, setQuotationProject] = useState<Project | null>(null)
  const [showMaterialModal, setShowMaterialModal] = useState(false)
  const [handoverProject, setHandoverProject] = useState<Project | null>(null)


  const { data: taskData, error: taskError, isLoading: taskLoading, mutate: mutateTasks } =
    useSWR<{ tasks: Task[] }>('/api/tasks?role=manager', fetcher, { refreshInterval: 300_000 })

  const { data: projectData, error: projectError, isLoading: projectLoading, mutate: mutateProjects } =
    useSWR<{ projects: Project[] }>(
      view === 'projects' || view === 'payments' || view === 'installation' || view === 'materials' || view === 'timesheets' ? '/api/projects' : null,
      fetcher,
      { refreshInterval: 300_000 },
    )

  const { data: teamData, isLoading: teamLoading } = useSWR<{ members: TeamMember[] }>(
    view === 'installation' ? '/api/team/installation' : null,
    fetcher,
    { refreshInterval: 300_000 },
  )

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

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-900">{open.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Open Tasks</p>
        </div>
        <div className="bg-white rounded-xl border border-orange-200 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-orange-600">{pendingReview.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Awaiting Approval</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-900">{projects.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Active Projects</p>
        </div>
      </div>

      {/* Task views */}
      {(view === 'tasks' || view === 'deliveries') && (
        <>
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
      {view === 'materials' && (
        <>
          {projectLoading && <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" /></div>}
          {!projectLoading && !projectError && (
            <MaterialsReviewView projects={projects} />
          )}
        </>
      )}

      {/* Projects view */}
      {view === 'projects' && (
        <>
          {projectLoading && <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" /></div>}
          {(projectError || projectsApiError) && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              Failed to load projects: {projectsApiError ?? 'network error'}.
              Visit <a href="/api/debug/projects" target="_blank" className="underline font-medium">/api/debug/projects</a> to diagnose.
            </div>
          )}
          {!projectLoading && !projectError && !projectsApiError && (
            <div className="grid gap-4 sm:grid-cols-2">
              {projects.map((p) => (
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
              {projects.length === 0 && (
                <p className="col-span-2 text-center py-10 text-sm text-gray-400">No active projects found.</p>
              )}
            </div>
          )}
        </>
      )}

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
