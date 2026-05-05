'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { Task, TaskUpdateInput, Project } from '@/lib/types'
import TaskList from '@/components/tasks/TaskList'
import ProjectCard from '@/components/projects/ProjectCard'
import PaymentBar from '@/components/projects/PaymentBar'
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

function AddPaymentModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [projectId, setProjectId] = useState('')
  const [amount, setAmount] = useState('')
  const [type, setType] = useState('Advance')
  const [status, setStatus] = useState('Received')
  const [method, setMethod] = useState('Bank Transfer')
  const [ref, setRef] = useState('')
  const [receivedDate, setReceivedDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSave() {
    if (!projectId || !amount) { setErr('Project ID and amount are required'); return }
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: [projectId],
          amount: parseFloat(amount),
          paymentType: type,
          paymentStatus: status,
          paymentMethod: method,
          referenceNo: ref || undefined,
          receivedDate: receivedDate || undefined,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      onSaved(); onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Payment"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={handleSave} loading={saving}>Save</Button></>}
    >
      <div className="space-y-4 text-sm">
        {err && <p className="text-red-600 text-xs">{err}</p>}
        <div><label className="block text-xs font-medium text-gray-500 mb-1">Project Record ID</label>
          <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={projectId} onChange={e => setProjectId(e.target.value)} placeholder="recXXXXXX" /></div>
        <div><label className="block text-xs font-medium text-gray-500 mb-1">Amount (AED)</label>
          <input type="number" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={amount} onChange={e => setAmount(e.target.value)} /></div>
        <div><label className="block text-xs font-medium text-gray-500 mb-1">Payment Type</label>
          <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={type} onChange={e => setType(e.target.value)}>
            {['Advance','Delivery','Material','Final','Progressive Payment'].map(o => <option key={o}>{o}</option>)}</select></div>
        <div><label className="block text-xs font-medium text-gray-500 mb-1">Payment Status</label>
          <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={status} onChange={e => setStatus(e.target.value)}>
            {['Received','Pending','Overdue'].map(o => <option key={o}>{o}</option>)}</select></div>
        <div><label className="block text-xs font-medium text-gray-500 mb-1">Payment Method</label>
          <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={method} onChange={e => setMethod(e.target.value)}>
            {['Bank Transfer','Cash','Cheque'].map(o => <option key={o}>{o}</option>)}</select></div>
        <div><label className="block text-xs font-medium text-gray-500 mb-1">Reference No.</label>
          <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={ref} onChange={e => setRef(e.target.value)} /></div>
        <div><label className="block text-xs font-medium text-gray-500 mb-1">Received Date</label>
          <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} /></div>
      </div>
    </Modal>
  )
}

export default function MgrDashboard() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view') ?? 'tasks'
  const [paymentModal, setPaymentModal] = useState(false)
  const [assignProject, setAssignProject] = useState<Project | null>(null)

  const { data: taskData, error: taskError, isLoading: taskLoading, mutate: mutateTasks } =
    useSWR<{ tasks: Task[] }>('/api/tasks?role=manager', fetcher, { refreshInterval: 30000, revalidateOnFocus: true })

  const { data: projectData, error: projectError, isLoading: projectLoading, mutate: mutateProjects } =
    useSWR<{ projects: Project[] }>(
      view === 'projects' || view === 'payments' || view === 'installation' ? '/api/projects' : null,
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
        {view === 'payments' && (
          <Button onClick={() => setPaymentModal(true)}>Add Payment</Button>
        )}
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
      {(view === 'tasks' || view === 'deliveries' || view === 'purchase') && (
        <>
          {taskLoading && <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" /></div>}
          {taskError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">Failed to load tasks. <button onClick={() => mutateTasks()} className="underline">Retry</button></div>}
          {!taskLoading && !taskError && (
            <TaskList
              tasks={view === 'deliveries' ? tasks.filter(t => t.handoverDocument?.length) : tasks}
              role="manager"
              onUpdate={handleUpdate}
            />
          )}
        </>
      )}

      {/* Projects view */}
      {view === 'projects' && (
        <>
          {projectLoading && <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" /></div>}
          {projectError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">Failed to load projects.</div>}
          {!projectLoading && !projectError && (
            <div className="grid gap-4 sm:grid-cols-2">
              {projects.map(p => <ProjectCard key={p.id} project={p} showPayments />)}
            </div>
          )}
        </>
      )}

      {/* Payments view */}
      {view === 'payments' && (
        <>
          {projectLoading && <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" /></div>}
          {!projectLoading && !projectError && (
            <div className="space-y-4">
              {projects.map(p => (
                <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="font-mono text-xs text-gray-400">{p.projectId}</span>
                    <span className="font-semibold text-sm text-gray-900">{p.projectName}</span>
                  </div>
                  <PaymentBar project={p} />
                </div>
              ))}
            </div>
          )}
        </>
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

      <AddPaymentModal
        open={paymentModal}
        onClose={() => setPaymentModal(false)}
        onSaved={() => mutateProjects()}
      />

      {assignProject && (
        <AssignInstallationModal
          project={assignProject}
          members={teamData?.members ?? []}
          onClose={() => setAssignProject(null)}
          onSaved={() => mutateProjects()}
        />
      )}
    </div>
  )
}
