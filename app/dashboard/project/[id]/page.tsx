'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Task, TaskUpdateInput, Project, Payment, ClientRequest } from '@/lib/types'
import { useSession } from '@/app/dashboard/layout-client'
import ItemBoard from '@/components/projects/ItemBoard'
import TaskList, { TaskListSkeleton } from '@/components/tasks/TaskList'
import { ItemSummary } from '@/components/projects/ItemProgressCard'
import ProjectAttachmentsSection from '@/components/projects/ProjectAttachmentsSection'
import ProjectFormsSection from '@/components/projects/ProjectFormsSection'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const UAE_EMIRATES = [
  'Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah',
]

const DUBAI_LOCATIONS = [
  'Abu Hail', 'Al Baraha', 'Al Barsha', 'Al Bastakiya', 'Al Buteen', 'Al Dhagaya',
  'Al Garhoud', 'Al Hamriya', 'Al Hudaiba', 'Al Jaddaf', 'Al Jafilia', 'Al Karama',
  'Al Mamzar', 'Al Manara', 'Al Mankhool', 'Al Mizhar', 'Al Muntazah', 'Al Quoz',
  'Al Qusais', 'Arjan', 'Arabian Ranches', 'Bluewaters Island', 'Bur Dubai',
  'Business Bay', 'City Walk', 'DAMAC Lagoons', 'Deira', 'Discovery Gardens',
  'District City', 'Downtown Dubai', 'Dubai Creek Harbour', 'Dubai Hills Estate',
  'Dubai Marina', 'Dubai Silicon Oasis', 'Emaar South', 'Al Furjan', 'Green Community',
  'Jumeirah', 'Jumeirah Lake Towers (JLT)', 'Jumeirah Village Circle (JVC)',
  'MBR City (Meydan)', 'Marina', 'Marsa Dubai', 'Motor City', 'Palm Jumeirah',
  'Port de La Mer', 'Rashidiya', 'Satwa', 'Sobha Hartland', 'Sport City',
  'The Springs', 'Tilal Al Ghaf', 'Town Square', 'Umm Suqeim',
]

interface ItemsProgressResponse {
  projectId: string
  projectName: string
  projectRef: string
  projectNickname?: string
  projectStage: string
  items: ItemSummary[]
}

interface TimesheetSummary {
  entryCount: number
  totalRegularHours: number
  totalOvertimeHours: number
  totalHours: number
  estimatedTotalCost?: number
}

interface ReportResponse {
  project: Project
  payments?: Payment[]
  timesheetSummary?: TimesheetSummary
}

// ── helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `AED ${n.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function statusBadge(s: string) {
  const map: Record<string, string> = {
    Received:  'bg-green-100 text-green-700',
    Pending:   'bg-yellow-100 text-yellow-700',
    Overdue:   'bg-red-100 text-red-700',
    Cancelled: 'bg-gray-100 text-gray-400 line-through',
  }
  return map[s] ?? 'bg-gray-100 text-gray-600'
}

// ── sub-components ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-gray-400 w-36 shrink-0">{label}</span>
      <span className="text-gray-800 font-medium">{value}</span>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-3">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function ProjectOverview({
  project,
  role,
  projectId,
  onSaved,
}: {
  project: Project
  role?: string
  projectId?: string
  onSaved?: () => void
}) {
  const canEdit = (role === 'sed' || role === 'manager' || role === 'superadmin') && !!projectId
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    emirate: project.emirate ?? '',
    location: project.location ?? '',
    detailedLocation: project.detailedLocation ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const showLocationDropdown = form.emirate === 'Dubai' || form.emirate === ''

  async function handleSave() {
    if (!form.emirate) { setErr('Emirate is required'); return }
    setSaving(true); setErr('')
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emirate: form.emirate,
          location: form.location,
          detailedLocation: form.detailedLocation,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error((d as { error?: string }).error ?? 'Failed')
      }
      setEditing(false)
      onSaved?.()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  const inp = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white'

  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Project info</h2>

      <div className="space-y-2">
        <InfoRow label="Client"       value={project.clientName} />
        <InfoRow label="Phone"        value={project.clientPhone} />
        {(() => {
          const allSeds = [
            ...(project.salesOwner?.name ? [project.salesOwner.name] : []),
            ...(project.communSeds ?? []),
          ]
          if (allSeds.length === 0) return null
          if (allSeds.length === 1) return <InfoRow label="SED" value={allSeds[0]} />
          return (
            <div className="flex gap-2 text-sm">
              <span className="text-gray-400 w-36 shrink-0">SEDs</span>
              <div className="flex flex-wrap gap-1.5">
                {allSeds.map((n) => (
                  <span key={n} className="bg-gray-100 text-gray-700 font-medium px-2 py-0.5 rounded-full text-xs">{n}</span>
                ))}
              </div>
            </div>
          )
        })()}
        <InfoRow label="Quotation #"  value={project.quotationNumber} />
        <InfoRow label="Reference"    value={project.quotationReference} />
        <InfoRow label="Payment mode" value={project.paymentMode} />
      </div>

      {/* Address block */}
      <div className="pt-1 border-t border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Address</p>
          {canEdit && !editing && (
            <button
              onClick={() => {
                setForm({ emirate: project.emirate ?? '', location: project.location ?? '', detailedLocation: project.detailedLocation ?? '' })
                setErr('')
                setEditing(true)
              }}
              className="text-xs text-brand-600 hover:underline font-medium"
            >
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-2.5">
            {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{err}</p>}

            <div>
              <label className="block text-xs text-gray-500 mb-1">Emirate *</label>
              <select value={form.emirate} onChange={(e) => { setForm((f) => ({ ...f, emirate: e.target.value, location: '' })) }} className={inp}>
                <option value="">— select —</option>
                {UAE_EMIRATES.map((em) => <option key={em}>{em}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Area {!showLocationDropdown && <span className="text-gray-400">(Dubai only)</span>}</label>
              {showLocationDropdown ? (
                <select value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} className={inp}>
                  <option value="">— select area —</option>
                  {DUBAI_LOCATIONS.map((l) => <option key={l}>{l}</option>)}
                </select>
              ) : (
                <input disabled className="w-full border border-gray-100 rounded-lg px-2.5 py-1.5 text-sm bg-gray-50 text-gray-400" placeholder="Select Dubai to pick an area" />
              )}
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Exact location</label>
              <input
                type="text"
                value={form.detailedLocation}
                onChange={(e) => setForm((f) => ({ ...f, detailedLocation: e.target.value }))}
                className={inp}
                placeholder="Building, floor, unit…"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 text-xs rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => { setEditing(false); setErr('') }}
                className="px-3 py-1.5 text-xs rounded-lg bg-gray-100 text-gray-600 font-medium hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <InfoRow label="Emirate"         value={project.emirate} />
            <InfoRow label="Location"        value={project.location} />
            <InfoRow label="Detail location" value={project.detailedLocation} />
          </div>
        )}
      </div>

      {project.projectDescription && (
        <div className="pt-1 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-1">Description</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{project.projectDescription}</p>
        </div>
      )}
    </section>
  )
}

function PaymentsSection({ project, payments }: { project: Project; payments: Payment[] }) {
  const total   = project.projectTotalCost ?? 0
  const paid    = project.totalPaid ?? 0
  const remaining = project.remainingBalance ?? (total - paid)
  const progress = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0

  const activePayments = payments.filter((p) => p.paymentStatus !== 'Cancelled')
  const cancelledPayments = payments.filter((p) => p.paymentStatus === 'Cancelled')

  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Payments</h2>

      {total > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Contract value"  value={fmt(total)} />
            <StatCard label="Collected"       value={fmt(paid)}  sub={`${progress}%`} />
            <StatCard label="Remaining"       value={fmt(remaining)} />
            <StatCard label="Payment mode"    value={project.paymentMode ?? '—'} />
          </div>

          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-2 rounded-full transition-all"
              style={{
                width: `${progress}%`,
                background: progress >= 100 ? '#22c55e' : 'linear-gradient(90deg,#d95e1a,#b84a14)',
              }}
            />
          </div>
        </>
      )}

      {activePayments.length === 0 ? (
        <p className="text-sm text-gray-400">No payments recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
                <th className="text-left py-2 pr-4">Type</th>
                <th className="text-left py-2 pr-4">Status</th>
                <th className="text-right py-2 pr-4">Amount</th>
                <th className="text-left py-2 pr-4">Method</th>
                <th className="text-left py-2 pr-4">Date</th>
                <th className="text-left py-2 pr-4">Stage</th>
                <th className="text-left py-2">Ref</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {activePayments.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="py-2 pr-4 font-medium text-gray-800">{p.paymentType}</td>
                  <td className="py-2 pr-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(p.paymentStatus)}`}>
                      {p.paymentStatus}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right font-mono text-gray-900">{fmt(p.amount)}</td>
                  <td className="py-2 pr-4 text-gray-600">{p.paymentMethod}</td>
                  <td className="py-2 pr-4 text-gray-500">{p.receivedDate ?? p.dueDate ?? '—'}</td>
                  <td className="py-2 pr-4 text-gray-400 text-xs">{p.stageAtPayment ?? '—'}</td>
                  <td className="py-2 text-gray-400 text-xs">{p.referenceNo ?? '—'}</td>
                </tr>
              ))}
              {cancelledPayments.length > 0 && cancelledPayments.map((p) => (
                <tr key={p.id} className="opacity-40">
                  <td className="py-1.5 pr-4 text-xs line-through">{p.paymentType}</td>
                  <td className="py-1.5 pr-4">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">Void</span>
                  </td>
                  <td className="py-1.5 pr-4 text-right font-mono text-xs line-through">{fmt(p.amount)}</td>
                  <td className="py-1.5 pr-4 text-xs">{p.paymentMethod}</td>
                  <td className="py-1.5 pr-4 text-xs">{p.receivedDate ?? p.dueDate ?? '—'}</td>
                  <td className="py-1.5 pr-4 text-xs">{p.stageAtPayment ?? '—'}</td>
                  <td className="py-1.5 text-xs">{p.referenceNo ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function TimesheetSection({ summary }: { summary: TimesheetSummary }) {
  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Labour hours</h2>

      {summary.entryCount === 0 ? (
        <p className="text-sm text-gray-400">No timesheet entries recorded for this project.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Regular hours"
            value={summary.totalRegularHours.toFixed(1)}
            sub={`${summary.entryCount} entr${summary.entryCount === 1 ? 'y' : 'ies'}`}
          />
          <StatCard
            label="Overtime hours"
            value={summary.totalOvertimeHours.toFixed(1)}
          />
          <StatCard
            label="Total hours"
            value={summary.totalHours.toFixed(1)}
          />
          {summary.estimatedTotalCost !== undefined && (
            <StatCard
              label="Est. labour cost"
              value={fmt(Math.round(summary.estimatedTotalCost))}
            />
          )}
        </div>
      )}
    </section>
  )
}

const TYPE_BADGE: Record<string, string> = {
  Trade:       'bg-blue-100 text-blue-700',
  Maintenance: 'bg-orange-100 text-orange-700',
  Variance:    'bg-purple-100 text-purple-700',
}

function LinkedRequestsSection({ requests }: { requests: ClientRequest[] }) {
  if (requests.length === 0) return null
  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Linked requests ({requests.length})
      </h2>
      <div className="space-y-2">
        {requests.map((req) => {
          const done = (req.tasks ?? []).filter((t) => t.status === 'Completed').length
          const total = (req.tasks ?? []).length
          return (
            <div key={req.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50 hover:bg-white transition-colors">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${TYPE_BADGE[req.requestType] ?? 'bg-gray-100 text-gray-600'}`}>
                {req.requestType}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">{req.projectName}</p>
                {req.tradeReference && (
                  <p className="text-[11px] font-mono text-gray-500">{req.tradeReference}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-400">{done}/{total}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                  req.projectStage === 'Closed' ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-700'
                }`}>
                  {req.projectStage}
                </span>
                <Link
                  href={`/dashboard/project/${req.id}`}
                  className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Open →
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── main page ────────────────────────────────────────────────────────────────

type Tab = 'tasks' | 'report'

export default function ProjectItemBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { role } = useSession()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('tasks')

  // Items + tasks (existing)
  const { data, error, isLoading, mutate } = useSWR<ItemsProgressResponse>(
    `/api/projects/${id}/items-progress`,
    fetcher,
    { refreshInterval: 300_000 },
  )
  const { data: tasksData, isLoading: tasksLoading, mutate: mutateTasks } = useSWR<{ tasks: Task[] }>(
    `/api/tasks?projectId=${id}`,
    fetcher,
    { refreshInterval: 300_000 },
  )

  // Report
  const { data: reportData, isLoading: reportLoading, mutate: mutateReport } = useSWR<ReportResponse>(
    tab === 'report' ? `/api/projects/${id}/report` : null,
    fetcher,
  )

  const canSeeRequests = role === 'sed' || role === 'manager' || role === 'superadmin'
  const { data: requestsData } = useSWR<{ requests: ClientRequest[] }>(
    tab === 'report' && canSeeRequests ? `/api/projects/${id}/requests` : null,
    fetcher,
  )

  const handleUpdate = async (taskId: string, fields: Partial<TaskUpdateInput>) => {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })
    if (!res.ok) {
      const body = await res.json()
      throw new Error(body.error ?? 'Update failed')
    }
    mutate()
    mutateTasks()
  }

  const displayName = data?.projectNickname ?? data?.projectName ?? '…'
  const projectRef = data?.projectRef ?? ''
  const itemCount = data?.items.length ?? 0

  const allTasks = tasksData?.tasks ?? []

  // Separate fetch for docs bar — not role-filtered, so all teams see all attachments
  const { data: docsData } = useSWR<{ tasks: Task[] }>(
    `/api/projects/${id}/attachments`,
    fetcher,
    { revalidateOnFocus: false },
  )
  const docsTasks = docsData?.tasks ?? []
  const projectLevelTasks = allTasks.filter((t) => !t.projectItem?.length)
  const hasItems = !isLoading && !error && (data?.items.length ?? 0) > 0
  const hasProjectTasks = !tasksLoading && projectLevelTasks.length > 0
  const bothLoaded = !isLoading && !tasksLoading
  const nothingToShow = bothLoaded && !hasItems && !hasProjectTasks

  return (
    <div>
      {/* Header */}
      <div className="bg-gradient-to-r from-teal-50 to-white border-b border-teal-100 px-6 py-5">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <div className="flex items-start gap-3">
          <span className="relative flex h-3 w-3 shrink-0 mt-1">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500" />
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-gray-400 uppercase tracking-wider">{projectRef}</span>
              {data?.projectStage && (
                <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-medium border border-teal-200">
                  {data.projectStage}
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900 mt-0.5">{displayName}</h1>
            {!isLoading && itemCount > 0 && (
              <p className="text-sm text-gray-500 mt-0.5">
                {itemCount} item{itemCount !== 1 ? 's' : ''} in production
              </p>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 border-b border-transparent">
          {([['tasks', 'Tasks & Items'], ['report', 'Project Report']] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-1.5 text-sm font-medium rounded-t-lg transition-colors ${
                tab === key
                  ? 'bg-white border border-b-white border-teal-100 text-teal-700 shadow-sm -mb-px'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Docs bar — visible to all roles; attachments fetched without role filter */}
      <div className="px-6 py-3 bg-white border-b border-gray-100 flex items-start gap-6 flex-wrap">
        <ProjectAttachmentsSection tasks={docsTasks} />
        <ProjectFormsSection projectId={id} role={role} />
      </div>

      {/* ── Tasks & Items tab ── */}
      {tab === 'tasks' && (
        <div className="p-6 max-w-5xl mx-auto space-y-8">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              Failed to load project data.{' '}
              <button onClick={() => mutate()} className="underline">Retry</button>
            </div>
          )}

          {tasksLoading && <TaskListSkeleton />}

          {!tasksLoading && projectLevelTasks.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Project tasks
              </h2>
              <TaskList
                tasks={projectLevelTasks}
                role={role}
                onUpdate={handleUpdate}
                groupByProject={false}
              />
            </section>
          )}


          {isLoading && !tasksLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
                  <div className="p-4 space-y-3">
                    <div className="flex justify-between">
                      <div className="h-4 bg-gray-100 rounded w-3/5" />
                      <div className="w-6 h-6 bg-gray-100 rounded-full" />
                    </div>
                    <div className="h-14 bg-teal-50 rounded-lg" />
                    <div className="flex gap-1">
                      {[1,2,3,4,5,6].map((d) => <div key={d} className="w-2 h-2 bg-gray-100 rounded-full" />)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {hasItems && (
            <section>
              {hasProjectTasks && (
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Items
                </h2>
              )}
              <ItemBoard
                projectId={id}
                items={data!.items}
                role={role}
                onUpdate={handleUpdate}
                onMutate={() => mutate()}
              />
            </section>
          )}

          {nothingToShow && (
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <p className="text-gray-700 text-sm font-medium">No tasks for your role on this project</p>
              <p className="text-gray-400 text-xs mt-1">Tasks will appear here once they become active</p>
            </div>
          )}
        </div>
      )}

      {/* ── Report tab ── */}
      {tab === 'report' && (
        <div className="p-6 max-w-3xl mx-auto space-y-4">
          {reportLoading && (
            <div className="space-y-4">
              {[1, 2, 3].map((n) => (
                <div key={n} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse space-y-3">
                  <div className="h-3 bg-gray-100 rounded w-24" />
                  <div className="h-4 bg-gray-100 rounded w-2/3" />
                  <div className="h-4 bg-gray-100 rounded w-1/2" />
                </div>
              ))}
            </div>
          )}

          {!reportLoading && reportData && (
            <>
              {(role === 'superadmin' || role === 'manager') && (
                <div className="flex justify-end">
                  <a
                    href={`/api/reports/download/project?id=${id}`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-4 py-2 rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download Report
                  </a>
                </div>
              )}
              <ProjectOverview project={reportData.project} role={role} projectId={id} onSaved={mutateReport} />
              {reportData.payments && (
                <PaymentsSection project={reportData.project} payments={reportData.payments} />
              )}
              {requestsData && requestsData.requests.length > 0 && (
                <LinkedRequestsSection requests={requestsData.requests} />
              )}
              {reportData.timesheetSummary && (
                <TimesheetSection summary={reportData.timesheetSummary} />
              )}
            </>
          )}

          {!reportLoading && !reportData && (
            <div className="text-center py-16 text-sm text-gray-400">
              Failed to load report.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
