'use client'

import { useState, useCallback, Fragment } from 'react'
import Link from 'next/link'
import useSWR, { mutate as globalMutate } from 'swr'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { Project, MaintenanceRecord, Announcement, Payment, Task } from '@/lib/types'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'

// ─── Types ───────────────────────────────────────────────────────────────────

type Page =
  | 'overview'
  | 'timeline'
  | 'phases'
  | 'activity'
  | 'payments'
  | 'warranty'
  | 'users'
  | 'announcements'

interface SuperadminMetrics {
  totalProjects: number
  activeProjects: number
  staleProjects: number
  pendingApprovals: number
  overduePayments: number
  totalRevenue: number
  totalPaid: number
  totalRemaining: number
}

interface TimelineProject {
  id: string
  projectId: string
  projectName: string
  clientName: string
  projectStage: string
  projectCreatedAt?: string
  items: Array<{ id: string; title: string; date: string; type: string }>
}

interface MaintenanceWithExtra extends MaintenanceRecord {
  daysRemaining: number
  projectNames: string[]
}

const PAGES: { id: Page; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'timeline', label: '3-Month Timeline' },
  { id: 'phases', label: 'Phase Gates' },
  { id: 'activity', label: 'All Team Activity' },
  { id: 'payments', label: 'Payment Tracker' },
  { id: 'warranty', label: 'Warranty Tracker' },
  { id: 'users', label: 'User Management' },
  { id: 'announcements', label: 'Announcements' },
]

const VIEW_AS = [
  { label: 'Manager view', path: '/dashboard/mgr' },
  { label: 'SED view', path: '/dashboard/sed' },
  { label: 'Fabrication view', path: '/dashboard/fab' },
  { label: 'Installation view', path: '/dashboard/fix' },
]

// ─── Shared helpers ──────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function isStale(lastModified: string | undefined): boolean {
  if (!lastModified) return false
  return (Date.now() - new Date(lastModified).getTime()) / (1000 * 60 * 60 * 24) > 3
}

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function MetricCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-center">
      <p className={`text-2xl font-bold ${color ?? 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Page 1: Overview ────────────────────────────────────────────────────────

function OverviewPage() {
  const { data: metricsData, isLoading: mLoading } = useSWR<SuperadminMetrics>(
    '/api/superadmin/metrics', fetcher, { refreshInterval: 30000 },
  )
  const { data: projectsData, isLoading: pLoading, mutate: mutp } = useSWR<{ projects: Project[] }>(
    '/api/projects?all=true', fetcher, { refreshInterval: 30000 },
  )

  const projects = projectsData?.projects ?? []
  const active = projects.filter((p) => !['Closed', 'Warranty Done'].includes(p.projectStage))

  async function handleAdvance(id: string) {
    const res = await fetch(`/api/projects/${id}/advance`, { method: 'POST' })
    if (!res.ok) {
      const d = await res.json()
      throw new Error(
        d.blockingTasks
          ? `${d.error}: ${d.blockingTasks.map((t: { taskName: string }) => t.taskName).join(', ')}`
          : d.error ?? 'Failed',
      )
    }
    mutp()
  }

  if (mLoading || pLoading) return <Spinner />

  const m = metricsData

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Overview</h2>
        <p className="text-sm text-gray-500">Portfolio summary and alerts</p>
      </div>

      {/* Metrics bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Total Projects" value={m?.totalProjects ?? 0} />
        <MetricCard label="Active" value={m?.activeProjects ?? 0} color="text-blue-600" />
        <MetricCard label="Stale (>3d)" value={m?.staleProjects ?? 0} color="text-yellow-600" />
        <MetricCard label="Pending Approval" value={m?.pendingApprovals ?? 0} color="text-orange-500" />
        <MetricCard label="Overdue Payments" value={m?.overduePayments ?? 0} color="text-red-600" />
        <MetricCard label="Total Revenue" value={`AED ${fmt(m?.totalRevenue ?? 0)}`} />
        <MetricCard label="Collected" value={`AED ${fmt(m?.totalPaid ?? 0)}`} color="text-green-600" />
        <MetricCard label="Remaining" value={`AED ${fmt(m?.totalRemaining ?? 0)}`} color="text-red-500" />
      </div>

      {/* Active projects table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-800">Active Projects</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">ID</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Project</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stage</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {active.map((p) => (
                <ProjectRow key={p.id} project={p} onAdvance={handleAdvance} />
              ))}
              {active.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-sm text-gray-400">No active projects.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ProjectRow({ project: p, onAdvance }: { project: Project; onAdvance: (id: string) => Promise<void> }) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const stale = isStale(p.lastModifiedTasks)

  async function advance() {
    setLoading(true); setErr('')
    try { await onAdvance(p.id) } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setLoading(false) }
  }

  return (
    <>
      <tr className={`hover:bg-gray-50 ${stale ? 'bg-yellow-50/30' : ''}`}>
        <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.projectId}</td>
        <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">{p.projectName}</td>
        <td className="px-4 py-3 text-gray-500 text-xs">{p.clientName}</td>
        <td className="px-4 py-3">
          <Badge variant={p.projectStage === 'Open' ? 'blue' : p.projectStage === 'Preparing' ? 'orange' : 'gray'}>
            {p.projectStage}
          </Badge>
        </td>
        <td className="px-4 py-3">
          {stale && <span className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-1.5 py-0.5">Stale</span>}
        </td>
        <td className="px-4 py-3 text-right">
          {p.projectStage !== 'Closed' && (
            <Button size="sm" variant="secondary" loading={loading} onClick={advance}>Advance →</Button>
          )}
        </td>
      </tr>
      {err && (
        <tr>
          <td colSpan={6} className="px-4 pb-2">
            <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{err}</p>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Page 2: 3-Month Timeline ─────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  installation: 'bg-blue-500',
  delivery: 'bg-green-500',
  activity: 'bg-purple-500',
}

function TimelinePage() {
  const { data, isLoading } = useSWR<{ projects: TimelineProject[] }>(
    '/api/superadmin/timeline', fetcher, { refreshInterval: 60000 },
  )

  if (isLoading) return <Spinner />

  const projects = data?.projects ?? []
  const now = new Date()
  const start = new Date(now); start.setDate(now.getDate() - 14)
  const end = new Date(now); end.setDate(now.getDate() + 76)
  const totalDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)

  function pct(dateStr: string): number {
    const t = new Date(dateStr).getTime()
    return Math.max(0, Math.min(100, ((t - start.getTime()) / (end.getTime() - start.getTime())) * 100))
  }

  const months: { label: string; left: number }[] = []
  const cur = new Date(start)
  cur.setDate(1)
  while (cur <= end) {
    months.push({
      label: cur.toLocaleString('default', { month: 'short', year: '2-digit' }),
      left: pct(cur.toISOString()),
    })
    cur.setMonth(cur.getMonth() + 1)
  }

  if (projects.length === 0) {
    return <div className="py-16 text-center text-sm text-gray-400">No active projects with upcoming dates.</div>
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">3-Month Timeline</h2>
        <p className="text-sm text-gray-500">Upcoming milestones across active projects (±14 days / +76 days)</p>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-gray-500">
        {Object.entries(TYPE_COLORS).map(([type, cls]) => (
          <span key={type} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${cls}`} />
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </span>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Month header */}
        <div className="relative h-8 border-b border-gray-100 bg-gray-50">
          {months.map((m, i) => (
            <span
              key={i}
              className="absolute top-1.5 text-xs text-gray-400"
              style={{ left: `calc(${m.left}% + 8px)` }}
            >
              {m.label}
            </span>
          ))}
          {/* Today line */}
          <div
            className="absolute top-0 bottom-0 w-px bg-red-400"
            style={{ left: `${pct(now.toISOString())}%` }}
          />
        </div>

        {projects.map((proj) => (
          <div key={proj.id} className="flex items-center border-b border-gray-50 last:border-0 group">
            {/* Project label */}
            <div className="w-48 shrink-0 px-4 py-3 border-r border-gray-100">
              <p className="text-xs font-medium text-gray-800 truncate">{proj.projectName}</p>
              <p className="text-xs text-gray-400 truncate">{proj.clientName}</p>
            </div>
            {/* Track */}
            <div className="flex-1 relative h-12 overflow-hidden">
              {/* Today line */}
              <div
                className="absolute top-0 bottom-0 w-px bg-red-200"
                style={{ left: `${pct(now.toISOString())}%` }}
              />
              {proj.items.map((item) => {
                const left = pct(item.date)
                const color = TYPE_COLORS[item.type] ?? 'bg-gray-400'
                return (
                  <div
                    key={item.id}
                    title={`${item.title} — ${item.date}`}
                    className="absolute top-1/2 -translate-y-1/2 group/pin"
                    style={{ left: `${left}%` }}
                  >
                    <div className={`w-3 h-3 rotate-45 ${color} border-2 border-white shadow-sm`} />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10 hidden group-hover/pin:block">
                      {item.title} · {item.date.slice(5)}
                    </div>
                  </div>
                )
              })}
              {proj.items.length === 0 && (
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-300">No upcoming events</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400">
        Showing {totalDays.toFixed(0)}-day window. Hover pins for details.
      </p>
    </div>
  )
}

// ─── Page 3: Phase Gates ──────────────────────────────────────────────────────

function PhasesPage() {
  const { data, isLoading, mutate } = useSWR<{ projects: Project[] }>(
    '/api/projects?all=true', fetcher, { refreshInterval: 30000 },
  )
  const projects = (data?.projects ?? []).filter((p) => !['Closed', 'Warranty Done'].includes(p.projectStage))

  async function handleAdvance(id: string) {
    const res = await fetch(`/api/projects/${id}/advance`, { method: 'POST' })
    if (!res.ok) {
      const d = await res.json()
      throw new Error(
        d.blockingTasks
          ? `${d.error}: ${d.blockingTasks.map((t: { taskName: string }) => t.taskName).join(', ')}`
          : d.error ?? 'Failed',
      )
    }
    mutate()
  }

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Phase Gates</h2>
        <p className="text-sm text-gray-500">Advance projects through stages. All tasks in the current stage must be completed.</p>
      </div>
      {projects.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-10">No active projects.</p>
      )}
      {projects.map((p) => (
        <PhaseGateCard key={p.id} project={p} onAdvance={handleAdvance} />
      ))}
    </div>
  )
}

function PhaseGateCard({ project: p, onAdvance }: { project: Project; onAdvance: (id: string) => Promise<void> }) {
  const [advancing, setAdvancing] = useState(false)
  const [err, setErr] = useState('')
  const [expanded, setExpanded] = useState(false)
  const { data: detail } = useSWR<{ project: Project & { tasks?: Task[] } }>(
    expanded ? `/api/projects/${p.id}` : null,
    fetcher,
  )

  async function advance() {
    setAdvancing(true); setErr('')
    try { await onAdvance(p.id) } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setAdvancing(false) }
  }

  const incompleteTasks = (detail?.project?.tasks ?? []).filter(
    (t) => t.status !== 'Completed' && t.status !== 'Locked',
  )

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="p-4 flex items-center gap-3">
        <button onClick={() => setExpanded((e) => !e)} className="text-gray-400 hover:text-gray-600">
          <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-gray-400">{p.projectId}</span>
            <Badge variant={p.projectStage === 'Open' ? 'blue' : p.projectStage === 'Preparing' ? 'orange' : 'gray'}>
              {p.projectStage}
            </Badge>
          </div>
          <p className="text-sm font-semibold text-gray-900 mt-0.5 truncate">{p.projectName}</p>
          <p className="text-xs text-gray-500">{p.clientName}</p>
        </div>
        <Button size="sm" variant="secondary" loading={advancing} onClick={advance}>
          Advance →
        </Button>
      </div>
      {err && <div className="px-4 pb-3"><p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{err}</p></div>}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
          {!detail && <p className="text-xs text-gray-400">Loading tasks…</p>}
          {detail && incompleteTasks.length === 0 && (
            <p className="text-xs text-green-600">All tasks complete — ready to advance.</p>
          )}
          {detail && incompleteTasks.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500 mb-2">{incompleteTasks.length} blocking task{incompleteTasks.length !== 1 ? 's' : ''}:</p>
              {incompleteTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-xs text-gray-700">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.status === 'In Progress' ? 'bg-blue-400' : 'bg-gray-300'}`} />
                  <span className="truncate">{t.taskName}</span>
                  <span className="shrink-0 text-gray-400">{t.department?.join(', ')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page 4: All Team Activity ────────────────────────────────────────────────

type Dept = 'All' | 'SED' | 'Fabrication' | 'Installation' | 'Management'
const DEPTS: Dept[] = ['All', 'SED', 'Fabrication', 'Installation', 'Management']

function ActivityPage() {
  const [dept, setDept] = useState<Dept>('All')
  const { data, isLoading, mutate } = useSWR<{ tasks: Task[] }>(
    '/api/tasks', fetcher, { refreshInterval: 60000 },
  )
  const tasks = data?.tasks ?? []

  const filtered = dept === 'All' ? tasks : tasks.filter((t) => t.department?.includes(dept))

  async function toggleFlag(task: Task) {
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { priorityFlag: !task.priorityFlag } }),
    })
    mutate()
  }

  // Monthly completions chart data
  const monthlyData = (() => {
    const map: Record<string, number> = {}
    for (const t of tasks) {
      if (!t.completedAt) continue
      const d = new Date(t.completedAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      map[key] = (map[key] ?? 0) + 1
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([key, count]) => ({ month: key.slice(5), count }))
  })()

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">All Team Activity</h2>
        <p className="text-sm text-gray-500">{tasks.length} tasks across all departments</p>
      </div>

      {/* Monthly chart */}
      {monthlyData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Monthly Completions (last 6 months)</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={monthlyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="count" fill="#6366f1" radius={[3, 3, 0, 0]} name="Completed" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Dept tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {DEPTS.map((d) => (
          <button
            key={d}
            onClick={() => setDept(d)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${dept === d ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Task table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="w-8 px-3 py-2.5" />
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Task</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Dept</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Project</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5 text-center">
                    <button onClick={() => toggleFlag(t)} title="Toggle priority">
                      <span className={`text-sm ${t.priorityFlag ? 'text-red-500' : 'text-gray-200 hover:text-gray-400'}`}>⚑</span>
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-gray-800 max-w-xs truncate">{t.taskName}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{t.department?.join(', ') ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <TaskStatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{t.projectId ?? '—'}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-sm text-gray-400">No tasks.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function TaskStatusBadge({ status }: { status: string }) {
  const map: Record<string, 'blue' | 'green' | 'orange' | 'gray' | 'red'> = {
    'In Progress': 'blue',
    Completed: 'green',
    'Pending Approval': 'orange',
    'To Do': 'gray',
    Locked: 'gray',
  }
  return <Badge variant={map[status] ?? 'gray'}>{status}</Badge>
}

// ─── Page 5: Payment Tracker ──────────────────────────────────────────────────

function PaymentsPage() {
  const { data, isLoading } = useSWR<{ projects: Project[] }>(
    '/api/projects?all=true', fetcher, { refreshInterval: 30000 },
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const projects = data?.projects ?? []
  const sorted = [...projects].sort((a, b) => (b.remainingBalance ?? 0) - (a.remainingBalance ?? 0))

  const totalRevenue = projects.reduce((s, p) => s + (p.projectTotalCost ?? 0), 0)
  const totalPaid = projects.reduce((s, p) => s + (p.totalPaid ?? 0), 0)
  const totalRemaining = projects.reduce((s, p) => s + (p.remainingBalance ?? 0), 0)
  const collectionRate = totalRevenue > 0 ? Math.round((totalPaid / totalRevenue) * 100) : 0

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Payment Tracker</h2>
        <p className="text-sm text-gray-500">Portfolio-wide payment status</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Total Contract" value={`AED ${fmt(totalRevenue)}`} />
        <MetricCard label="Collected" value={`AED ${fmt(totalPaid)}`} color="text-green-600" />
        <MetricCard label="Remaining" value={`AED ${fmt(totalRemaining)}`} color="text-red-500" />
        <MetricCard label="Collection Rate" value={`${collectionRate}%`} color={collectionRate >= 70 ? 'text-green-600' : 'text-orange-500'} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Project</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Contract</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Paid</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Remaining</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Progress</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map((p) => (
                <Fragment key={p.id}>
                  <tr
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => {
                      setSelectedId(selectedId === p.id ? null : p.id)
                      setShowForm(false)
                    }}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 truncate max-w-[180px]">{p.projectName}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{p.clientName}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-gray-700">
                      {p.projectTotalCost != null ? `AED ${p.projectTotalCost.toLocaleString()}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-green-700">
                      {p.totalPaid != null ? `AED ${p.totalPaid.toLocaleString()}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-red-600">
                      {p.remainingBalance != null ? `AED ${p.remainingBalance.toLocaleString()}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-16">
                          <div
                            className="bg-green-500 h-1.5 rounded-full"
                            style={{ width: `${Math.min(100, p.paymentProgress ?? 0)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 shrink-0">{p.paymentProgress ?? 0}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs text-right">
                      {selectedId === p.id ? '▲' : '▼'}
                    </td>
                  </tr>
                  {selectedId === p.id && (
                    <tr>
                      <td colSpan={7} className="px-4 pb-4 pt-2 bg-gray-50">
                        <PaymentDetail project={p} showForm={showForm} setShowForm={setShowForm} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-sm text-gray-400">No projects.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function PaymentDetail({
  project: p,
  showForm,
  setShowForm,
}: {
  project: Project
  showForm: boolean
  setShowForm: (v: boolean) => void
}) {
  const { data, isLoading, mutate } = useSWR<{ project: { payments?: Payment[] } }>(
    `/api/projects/${p.id}`,
    fetcher,
  )
  const payments = data?.project?.payments ?? []

  const [form, setForm] = useState({
    amount: '',
    paymentType: 'Instalment',
    paymentStatus: 'Pending',
    paymentMethod: 'Bank Transfer',
    referenceNo: '',
    receivedDate: '',
    dueDate: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [ferr, setFerr] = useState('')

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setFerr(''); setSaved(false)
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: [p.id],
          amount: parseFloat(form.amount),
          paymentType: form.paymentType,
          paymentStatus: form.paymentStatus,
          paymentMethod: form.paymentMethod,
          referenceNo: form.referenceNo || undefined,
          receivedDate: form.receivedDate || undefined,
          dueDate: form.dueDate || undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed')
      }
      setSaved(true)
      setForm({ amount: '', paymentType: 'Instalment', paymentStatus: 'Pending', paymentMethod: 'Bank Transfer', referenceNo: '', receivedDate: '', dueDate: '' })
      mutate()
      globalMutate('/api/projects?all=true')
    } catch (e) {
      setFerr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <div className="py-4"><Spinner /></div>

  return (
    <div className="space-y-3">
      {payments.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500">
              <th className="text-left py-1 pr-4">Type</th>
              <th className="text-left py-1 pr-4">Status</th>
              <th className="text-right py-1 pr-4">Amount</th>
              <th className="text-left py-1 pr-4">Method</th>
              <th className="text-left py-1">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {payments.map((pm) => (
              <tr key={pm.id}>
                <td className="py-1.5 pr-4 text-gray-700">{pm.paymentType}</td>
                <td className="py-1.5 pr-4">
                  <Badge variant={pm.paymentStatus === 'Received' ? 'green' : pm.paymentStatus === 'Pending' ? 'orange' : 'gray'} size="sm">
                    {pm.paymentStatus}
                  </Badge>
                </td>
                <td className="py-1.5 pr-4 text-right font-mono text-gray-800">AED {pm.amount.toLocaleString()}</td>
                <td className="py-1.5 pr-4 text-gray-500">{pm.paymentMethod}</td>
                <td className="py-1.5 text-gray-400">{pm.receivedDate ?? pm.dueDate ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {payments.length === 0 && <p className="text-xs text-gray-400">No payment records.</p>}

      <button
        onClick={() => setShowForm(!showForm)}
        className="text-xs text-brand-600 hover:underline font-medium"
      >
        {showForm ? '− Hide form' : '+ Add payment'}
      </button>

      {showForm && (
        <form onSubmit={submitPayment} className="grid grid-cols-2 gap-3 mt-2 p-3 bg-white rounded-lg border border-gray-200">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Amount (AED) *</label>
            <input
              required
              type="number"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="0"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Type</label>
            <select
              value={form.paymentType}
              onChange={(e) => setForm((f) => ({ ...f, paymentType: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {['Deposit', 'Instalment', 'Final Payment', 'Other'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Status</label>
            <select
              value={form.paymentStatus}
              onChange={(e) => setForm((f) => ({ ...f, paymentStatus: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {['Pending', 'Received', 'Overdue'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Method</label>
            <select
              value={form.paymentMethod}
              onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {['Bank Transfer', 'Cheque', 'Cash', 'Other'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Reference No.</label>
            <input
              type="text"
              value={form.referenceNo}
              onChange={(e) => setForm((f) => ({ ...f, referenceNo: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Received Date</label>
            <input
              type="date"
              value={form.receivedDate}
              onChange={(e) => setForm((f) => ({ ...f, receivedDate: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Due Date</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="col-span-2 flex items-center gap-3">
            <Button type="submit" size="sm" loading={saving}>Save Payment</Button>
            {saved && <span className="text-xs text-green-600">Saved.</span>}
            {ferr && <span className="text-xs text-red-600">{ferr}</span>}
          </div>
        </form>
      )}
    </div>
  )
}

// ─── Page 6: Warranty Tracker ─────────────────────────────────────────────────

function WarrantyPage() {
  const { data, isLoading } = useSWR<{ records: MaintenanceWithExtra[] }>(
    '/api/maintenance', fetcher, { refreshInterval: 60000 },
  )
  const records = data?.records ?? []

  const expired = records.filter((r) => r.daysRemaining < 0).length
  const expiringSoon = records.filter((r) => r.daysRemaining >= 0 && r.daysRemaining < 30).length
  const healthy = records.filter((r) => r.daysRemaining >= 30).length

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Warranty Tracker</h2>
        <p className="text-sm text-gray-500">Maintenance records sorted by expiry date</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Total" value={records.length} />
        <MetricCard label="Expiring Soon (< 30d)" value={expiringSoon} color="text-orange-500" />
        <MetricCard label="Expired" value={expired} color="text-red-600" />
      </div>

      {records.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-10">No maintenance records.</p>
      )}

      {records.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">ID</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Project</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Start</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">End</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Remaining</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {records.map((r) => {
                const d = r.daysRemaining
                const color = d < 0 ? 'red' : d < 30 ? 'orange' : 'green'
                const label = d < 0 ? `Expired ${Math.abs(d)}d ago` : `${d}d left`
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.maintenanceId}</td>
                    <td className="px-4 py-3 text-gray-700 text-xs">
                      {(r.projectNames ?? []).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.warrantyType ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.startDate}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.endDate}</td>
                    <td className="px-4 py-3">
                      <Badge variant={color}>{label}</Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Page 7: User Management ──────────────────────────────────────────────────

function UsersPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
        <p className="text-sm text-gray-500">Create, edit, and deactivate system users.</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
        <p className="text-sm text-gray-500 mb-4">Manage users in the dedicated users panel.</p>
        <Link
          href="/dashboard/superadmin/users"
          className="inline-flex items-center gap-2 bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors"
        >
          Open User Management →
        </Link>
      </div>
    </div>
  )
}

// ─── Page 8: Announcements ────────────────────────────────────────────────────

interface AnnouncementForm {
  title: string
  message: string
  pinned: boolean
  visibleTo: string
  expiresAt: string
}

const EMPTY_FORM: AnnouncementForm = {
  title: '',
  message: '',
  pinned: false,
  visibleTo: 'All',
  expiresAt: '',
}

function AnnouncementsPage() {
  const { data, isLoading, mutate } = useSWR<{ announcements: Announcement[] }>(
    '/api/announcements', fetcher, { refreshInterval: 60000 },
  )
  const announcements = data?.announcements ?? []
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<AnnouncementForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function startCreate() { setEditing('new'); setForm(EMPTY_FORM); setErr('') }
  function startEdit(a: Announcement) {
    setEditing(a.id)
    setForm({ title: a.title, message: a.message ?? '', pinned: a.pinned ?? false, visibleTo: a.visibleTo ?? 'All', expiresAt: a.expiresAt ?? '' })
    setErr('')
  }
  function cancelEdit() { setEditing(null); setErr('') }

  const handleSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setSaving(true); setErr('')
    try {
      const body = {
        title: form.title,
        message: form.message || undefined,
        pinned: form.pinned,
        visibleTo: form.visibleTo || undefined,
        expiresAt: form.expiresAt || undefined,
      }
      const res = await fetch(
        editing === 'new' ? '/api/announcements' : `/api/announcements/${editing}`,
        {
          method: editing === 'new' ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed')
      }
      mutate()
      setEditing(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }, [editing, form, mutate])

  async function handleDelete(id: string) {
    if (!confirm('Delete this announcement?')) return
    await fetch(`/api/announcements/${id}`, { method: 'DELETE' })
    mutate()
  }

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Announcements</h2>
          <p className="text-sm text-gray-500">{announcements.length} announcement{announcements.length !== 1 ? 's' : ''}</p>
        </div>
        <Button size="sm" onClick={startCreate}>+ New</Button>
      </div>

      {/* Form */}
      {editing && (
        <form onSubmit={handleSave} className="bg-white rounded-xl border border-brand-200 shadow-sm p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-800">{editing === 'new' ? 'New Announcement' : 'Edit Announcement'}</p>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Title *</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Announcement title"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Message</label>
            <textarea
              rows={3}
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="Optional message body"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Visible to</label>
              <select
                value={form.visibleTo}
                onChange={(e) => setForm((f) => ({ ...f, visibleTo: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {['All', 'SED', 'Fabrication', 'Installation', 'Management'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Expires at</label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))}
              className="rounded"
            />
            Pin to top
          </label>
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" loading={saving}>Save</Button>
            <button type="button" onClick={cancelEdit} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            {err && <span className="text-xs text-red-600">{err}</span>}
          </div>
        </form>
      )}

      {/* Table */}
      {announcements.length === 0 && !editing && (
        <p className="text-sm text-gray-400 text-center py-10">No announcements yet.</p>
      )}

      {announcements.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Audience</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pinned</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Expires</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {announcements.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{a.title}</p>
                    {a.message && <p className="text-xs text-gray-400 truncate max-w-xs mt-0.5">{a.message}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{a.visibleTo ?? 'All'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{a.pinned ? '📌' : '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{a.expiresAt ?? 'Never'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => startEdit(a)} className="text-xs text-brand-600 hover:underline">Edit</button>
                      <button onClick={() => handleDelete(a.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function SuperadminDashboard() {
  const [page, setPage] = useState<Page>('overview')

  return (
    <div className="flex min-h-full">
      {/* Internal sidebar */}
      <aside className="w-48 shrink-0 border-r border-gray-200 bg-white sticky top-0 self-start h-screen overflow-y-auto">
        <nav className="py-3">
          {PAGES.map((p) => (
            <button
              key={p.id}
              onClick={() => setPage(p.id)}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                page === p.id
                  ? 'bg-brand-50 text-brand-700 font-semibold border-r-2 border-brand-500'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {p.label}
            </button>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-gray-100 mt-2">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-2">View as</p>
          {VIEW_AS.map((l) => (
            <Link
              key={l.path}
              href={l.path}
              className="block text-xs text-brand-600 hover:underline py-1"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </aside>

      {/* Page content */}
      <div className="flex-1 p-6 min-w-0">
        {page === 'overview' && <OverviewPage />}
        {page === 'timeline' && <TimelinePage />}
        {page === 'phases' && <PhasesPage />}
        {page === 'activity' && <ActivityPage />}
        {page === 'payments' && <PaymentsPage />}
        {page === 'warranty' && <WarrantyPage />}
        {page === 'users' && <UsersPage />}
        {page === 'announcements' && <AnnouncementsPage />}
      </div>
    </div>
  )
}
