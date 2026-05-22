'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { Task, TaskUpdateInput, Project, Material } from '@/lib/types'
import TaskGroupedList from '@/components/tasks/TaskGroupedList'
import ProjectCard from '@/components/projects/ProjectCard'
import ProjectNotesEditor from '@/components/projects/ProjectNotesEditor'
import PaymentTrackerView from '@/components/projects/PaymentTrackerView'
import QuotationModal from '@/components/projects/QuotationModal'
import MaterialOrderModal from '@/components/projects/MaterialOrderModal'
import HandoverModal from '@/components/projects/HandoverModal'
import GatePassModal from '@/components/projects/GatePassModal'
import PaymentCalendar from '@/components/projects/PaymentCalendar'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

interface TeamMember { id: string; name: string; role: string }

function AssignInstallationModal({
  project,
  members,
  onClose,
  onSaved,
}: {
  project: Project
  members: TeamMember[]
  onClose: () => void
  onSaved: () => void
}) {
  const current = project.assignedInstallationTeam ?? []
  const [selected, setSelected] = useState<string[]>(current)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function toggle(id: string) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  async function handleSave() {
    setSaving(true); setErr('')
    try {
      const res = await fetch(`/api/projects/${project.id}/assign-installation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamMemberIds: selected }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      onSaved(); onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Assign Installation Team — ${project.projectName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>Save</Button>
        </>
      }
    >
      <div className="space-y-2 text-sm">
        {err && <p className="text-red-600 text-xs">{err}</p>}
        {members.length === 0 && <p className="text-gray-500 text-xs">No active installation team members found.</p>}
        {members.map((m) => (
          <label key={m.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.includes(m.id)}
              onChange={() => toggle(m.id)}
              className="rounded border-gray-300 text-brand-500 focus:ring-brand-500"
            />
            <span className="text-gray-800">{m.name}</span>
          </label>
        ))}
      </div>
    </Modal>
  )
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const STATUS_COLORS: Record<string, string> = {
  'Not ordered':        'bg-gray-100 text-gray-600',
  'Pending approval':   'bg-yellow-100 text-yellow-700',
  'Ordered':            'bg-blue-100 text-blue-700',
  'Partially received': 'bg-orange-100 text-orange-700',
  'Received':           'bg-emerald-100 text-emerald-700',
  'Delayed':            'bg-red-100 text-red-700',
}

const MATERIAL_STATUSES = ['Not ordered', 'Pending approval', 'Ordered', 'Partially received', 'Received', 'Delayed'] as const

function MaterialsReviewView({ projects }: { projects: Project[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  const { data, isLoading, mutate } = useSWR<{ materials: Material[] }>(
    selectedId ? `/api/projects/${selectedId}/materials` : null,
    fetcher,
    { refreshInterval: 30000 },
  )
  const materials = data?.materials ?? []

  async function updateStatus(materialId: string, status: string) {
    setUpdating(materialId)
    const optimistic = materials.map((m) =>
      m.id === materialId ? { ...m, orderStatus: status } : m,
    )
    mutate({ materials: optimistic }, false)
    try {
      const res = await fetch(`/api/materials/${materialId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderStatus: status }),
      })
      if (!res.ok) throw new Error('Failed')
    } catch {
      mutate()
    } finally {
      setUpdating(null)
      mutate()
    }
  }

  const active = materials.filter((m) => m.orderStatus !== 'Received')
  const received = materials.filter((m) => m.orderStatus === 'Received')

  return (
    <div className="space-y-4">
      {/* Project selector */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
        <p className="text-sm font-semibold text-gray-700">Material Orders — Select Project</p>
        <div className="flex flex-wrap gap-2">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`text-xs border rounded-lg px-3 py-1.5 font-medium transition-colors ${
                selectedId === p.id
                  ? 'bg-brand-600 border-brand-600 text-white'
                  : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
              }`}
            >
              {p.projectId} — {p.projectName}
            </button>
          ))}
          {projects.length === 0 && <p className="text-xs text-gray-400">No active projects.</p>}
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full" />
        </div>
      )}

      {!isLoading && selectedId && materials.length === 0 && (
        <p className="text-center py-8 text-sm text-gray-400">No material orders for this project.</p>
      )}

      {active.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Active Orders ({active.length})</p>
          </div>
          <div className="divide-y divide-gray-50">
            {active.map((m) => (
              <div key={m.id} className="px-4 py-3 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{m.name}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-0.5">
                    {m.purpose && <span className="font-medium text-gray-600">{m.purpose}</span>}
                    {m.supplier && <span>Supplier: {m.supplier}</span>}
                    {m.quantity != null && <span>Qty: {m.quantity} {m.unit ?? ''}</span>}
                    {m.expectedArrivalDate && <span>Expected: {m.expectedArrivalDate}</span>}
                    {m.requestedBy && <span>By: {m.requestedBy}</span>}
                  </div>
                  {m.notes && <p className="text-xs text-gray-400 mt-0.5 italic">{m.notes}</p>}
                </div>
                <select
                  value={m.orderStatus ?? 'Not ordered'}
                  disabled={updating === m.id}
                  onChange={(e) => updateStatus(m.id, e.target.value)}
                  className={`text-xs border rounded-lg px-2 py-1.5 font-medium shrink-0 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60 ${
                    STATUS_COLORS[m.orderStatus ?? ''] ?? 'bg-gray-100 text-gray-600'
                  } border-transparent`}
                >
                  {MATERIAL_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {received.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm opacity-75">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-500">Received ({received.length})</p>
          </div>
          <div className="divide-y divide-gray-50">
            {received.map((m) => (
              <div key={m.id} className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-600">{m.name}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-400 mt-0.5">
                    {m.supplier && <span>{m.supplier}</span>}
                    {m.quantity != null && <span>{m.quantity} {m.unit ?? ''}</span>}
                    {m.actualArrivalDate && <span>Arrived: {m.actualArrivalDate}</span>}
                  </div>
                </div>
                <select
                  value={m.orderStatus ?? 'Received'}
                  disabled={updating === m.id}
                  onChange={(e) => updateStatus(m.id, e.target.value)}
                  className="text-xs border border-transparent rounded-lg px-2 py-1.5 font-medium shrink-0 bg-emerald-100 text-emerald-700 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60"
                >
                  {MATERIAL_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {!selectedId && (
        <p className="text-center py-10 text-sm text-gray-400">Select a project to review its material orders.</p>
      )}
    </div>
  )
}

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
            <TaskGroupedList
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
