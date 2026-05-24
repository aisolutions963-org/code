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
import GatePassModal from '@/components/projects/GatePassModal'
import PaymentCalendar from '@/components/projects/PaymentCalendar'
import MaterialsReviewView from '@/components/projects/MaterialsReviewView'
import AssignInstallationModal, { TeamMember } from '@/components/projects/AssignInstallationModal'

const fetcher = (url: string) => fetch(url).then((r) => r.json())


export default function MgrDashboard() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view') ?? 'tasks'
  const [assignProject, setAssignProject] = useState<Project | null>(null)
  const [quotationProject, setQuotationProject] = useState<Project | null>(null)
  const [showMaterialModal, setShowMaterialModal] = useState(false)
  const [handoverProject, setHandoverProject] = useState<Project | null>(null)
  const [gatePassProject, setGatePassProject] = useState<Project | null>(null)

  const { data: taskData, error: taskError, isLoading: taskLoading, mutate: mutateTasks } =
    useSWR<{ tasks: Task[] }>('/api/tasks?role=manager', fetcher, { refreshInterval: 30000, revalidateOnFocus: true })

  const { data: projectData, error: projectError, isLoading: projectLoading, mutate: mutateProjects } =
    useSWR<{ projects: Project[] }>(
      view === 'projects' || view === 'payments' || view === 'installation' || view === 'materials' ? '/api/projects' : null,
      fetcher,
      { refreshInterval: 30000, revalidateOnFocus: true },
    )

  const { data: teamData } = useSWR<{ members: TeamMember[] }>(
    view === 'installation' ? '/api/team/installation' : null,
    fetcher,
    { refreshInterval: 60000 },
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
          <p className="text-2xl font-bold text-orange-500">{pendingReview.length}</p>
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
              tasks={view === 'deliveries' ? tasks.filter(t => t.handoverDocument?.length) : tasks}
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
                    <button onClick={() => setGatePassProject(p)} className="text-xs text-orange-600 hover:text-orange-700 font-medium">
                      Gate Pass
                    </button>
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
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <PaymentCalendar />
        </div>
      )}

      {/* Installation team assignment view */}
      {view === 'installation' && (
        <>
          {projectLoading && <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" /></div>}
          {!projectLoading && !projectError && (
            <div className="grid gap-4 sm:grid-cols-2">
              {projects.map((p) => (
                <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
                  <ProjectCard project={p} />
                  <div className="pt-1 border-t border-gray-100">
                    {p.assignedInstallationTeam && p.assignedInstallationTeam.length > 0 ? (
                      <p className="text-xs text-gray-500">
                        Team assigned ({p.assignedInstallationTeam.length} member{p.assignedInstallationTeam.length !== 1 ? 's' : ''})
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 italic">No team assigned</p>
                    )}
                    <button
                      onClick={() => setAssignProject(p)}
                      className="mt-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium"
                    >
                      Assign Team
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
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

      {gatePassProject && (
        <GatePassModal
          project={gatePassProject}
          onClose={() => setGatePassProject(null)}
          onCreated={() => mutateProjects()}
        />
      )}

    </div>
  )
}
