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
      view === 'projects' ? '/api/projects' : null,
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
  if (view === 'site-visits') visibleTasks = tasks.filter((t) => t.taskStartDate)
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
      {view !== 'projects' && (
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
