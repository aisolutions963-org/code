'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Task, TaskUpdateInput } from '@/lib/types'
import Button from '@/components/ui/Button'
import NewProjectModalComponent from '@/components/projects/NewProjectModal'
import { KpiCounts, SedStat } from './types'
import { fetcher, SedChart } from './shared'
import ReportsSection from './ReportsSection'
import WorkHoursChart from './WorkHoursChart'
import FollowUpDecisionPanel from './FollowUpDecisionPanel'
import TaskStatusBadge from './TaskStatusBadge'

function KpiCard({ label, value, href, downloadHref, loading }: { label: string; value: number; href: string; downloadHref: string; loading: boolean }) {
  return (
    <div className="group bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-brand-300 transition-all relative overflow-hidden">
      <Link href={href} className="block p-4">
        {loading ? (
          <div className="h-7 w-12 bg-gray-100 rounded animate-pulse mx-auto mb-1" />
        ) : (
          <p className="text-3xl font-bold text-gray-900 text-center">{value}</p>
        )}
        <p className="text-xs text-gray-500 text-center mt-1 leading-tight">{label}</p>
      </Link>
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <a
          href={downloadHref}
          onClick={(e) => e.stopPropagation()}
          title="Download Excel"
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-green-50 text-green-600 hover:text-green-700 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </a>
        <Link href={href} className="w-6 h-6 flex items-center justify-center rounded hover:bg-brand-50 text-brand-500 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </Link>
      </div>
    </div>
  )
}

export default function OverviewPage() {
  const { data: kpiData, isLoading: kpiLoading } = useSWR<KpiCounts>(
    '/api/superadmin/kpi-counts', fetcher,
  )
  const { data: sedData, isLoading: sedLoading } = useSWR<{ seds: string[]; data: SedStat[] }>(
    '/api/superadmin/sed-stats', fetcher, { refreshInterval: 300_000 },
  )
  const { data: tasksData, isLoading: tasksLoading, mutate: mutateTasks } = useSWR<{ tasks: Task[] }>(
    '/api/tasks', fetcher, { refreshInterval: 300_000 },
  )
  const [showNewProject, setShowNewProject] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [cleanResult, setCleanResult] = useState<{ total: number; deleted: Record<string, number> } | null>(null)

  async function runCleanup() {
    setCleaning(true)
    setCleanResult(null)
    try {
      const res = await fetch('/api/admin/cleanup', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Cleanup failed')
      setCleanResult(data)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Cleanup failed')
    } finally {
      setCleaning(false)
    }
  }

  const kpi = kpiData
  const allTasks = tasksData?.tasks ?? []

  // My tasks: same logic as MyTasksPage — pending approvals, call-client, follow-up
  const myTasks = allTasks.filter(
    (t) =>
      t.status === 'Pending Approval' ||
      t.taskName.toLowerCase().includes('call the client') ||
      t.taskName === 'Follow Up',
  ).filter((t) => t.status !== 'Locked' && t.status !== 'Completed')

  const sortedTasks = [
    ...myTasks.filter((t) => t.status === 'Pending Approval'),
    ...myTasks.filter((t) => t.status === 'In Progress'),
    ...myTasks.filter((t) => t.status === 'To Do'),
  ]

  const followUpTasks = myTasks.filter((t) => t.taskName === 'Follow Up' && t.status === 'To Do')
  const regularTasks = sortedTasks.filter((t) => !(t.taskName === 'Follow Up' && t.status === 'To Do'))

  async function handleTaskUpdate(id: string, fields: Partial<TaskUpdateInput>) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })
    if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? 'Update failed') }
    mutateTasks()
  }

  const BASE_PROJECTS_URL = '/dashboard/superadmin?view=projects'

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Overview</h2>
          <p className="text-sm text-gray-500">Portfolio summary and team performance</p>
        </div>
        <Button size="sm" onClick={() => setShowNewProject(true)}>+ New Project</Button>
      </div>

      {/* ── Section 1: KPI Cards ────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total Projects" value={kpi?.total ?? 0} href={BASE_PROJECTS_URL} downloadHref="/api/reports/download/projects-by-stage" loading={kpiLoading} />
        <KpiCard label="Preparing" value={kpi?.preparing ?? 0} href={`${BASE_PROJECTS_URL}&stage=Preparing`} downloadHref="/api/reports/download/projects-by-stage?stage=Preparing" loading={kpiLoading} />
        <KpiCard label="Open" value={kpi?.open ?? 0} href={`${BASE_PROJECTS_URL}&stage=Open`} downloadHref="/api/reports/download/projects-by-stage?stage=Open" loading={kpiLoading} />
        <KpiCard label="Not Approved" value={kpi?.notApproved ?? 0} href={`${BASE_PROJECTS_URL}&stage=Not-Approved`} downloadHref="/api/reports/download/projects-by-stage?stage=Not-Approved" loading={kpiLoading} />
        <KpiCard label="Finished" value={kpi?.finished ?? 0} href={`${BASE_PROJECTS_URL}&stage=Closed`} downloadHref="/api/reports/download/projects-by-stage?stage=Closed" loading={kpiLoading} />
        <KpiCard label="Active Warranty" value={kpi?.maintenanceActive ?? 0} href={`${BASE_PROJECTS_URL}&stage=Closed+and+active+warranty`} downloadHref="/api/reports/download/projects-by-stage?stage=Closed+and+active+warranty" loading={kpiLoading} />
        <KpiCard label="Warranty Expired" value={kpi?.maintenanceExpired ?? 0} href={`${BASE_PROJECTS_URL}&stage=Warranty+expired`} downloadHref="/api/reports/download/projects-by-stage?stage=Warranty+expired" loading={kpiLoading} />
      </div>

      {/* ── Section 2: SED Performance Chart ───────────────── */}
      {!sedLoading && (sedData?.data?.length ?? 0) > 0 && (
        <SedChart data={sedData!.data} seds={sedData!.seds} />
      )}
      {sedLoading && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      )}

      {/* ── Section 3: My Tasks & Approvals ────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">My Tasks & Approvals</p>
          <div className="flex items-center gap-2">
            {myTasks.length > 0 && (
              <span className="text-xs bg-brand-100 text-brand-700 font-semibold px-2 py-0.5 rounded-full">
                {myTasks.length}
              </span>
            )}
            <a
              href="/dashboard/superadmin?view=tasks"
              className="text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              View All
            </a>
          </div>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: '320px' }}>
          {tasksLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : followUpTasks.length === 0 && regularTasks.length === 0 ? (
            <div className="flex flex-col items-center py-10 gap-2">
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-gray-400">No pending tasks. You&apos;re all caught up.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {followUpTasks.map((t) => (
                <FollowUpDecisionPanel key={t.id} task={t} onDone={mutateTasks} />
              ))}
              {regularTasks.map((t) => (
                <div key={t.id} className="px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-xs text-gray-400 shrink-0">{t.projectRef ?? ''}</span>
                    <span className="text-sm text-gray-800 flex-1 min-w-0 truncate">{t.taskName}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {t.department && t.department.length > 0 && (
                        <span className="text-[10px] font-semibold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                          {t.department[0]}
                        </span>
                      )}
                      <TaskStatusBadge status={t.status} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Section 4: Reports ─────────────────────────────── */}
      <ReportsSection />

      {/* ── Section 5: Work Hours by Project ───────────────── */}
      <WorkHoursChart />

      {/* ── Section 6: Database Cleanup ────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-700">Database Cleanup</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Remove read notifications, stale project references, and expired inactivity alerts
            </p>
          </div>
          <button
            onClick={runCleanup}
            disabled={cleaning}
            className="shrink-0 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {cleaning ? 'Cleaning…' : 'Clean Up'}
          </button>
        </div>
        {cleanResult && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-green-700 mb-1.5">
              Done — {cleanResult.total} row{cleanResult.total !== 1 ? 's' : ''} removed
            </p>
            <ul className="space-y-0.5">
              {Object.entries(cleanResult.deleted).map(([key, count]) => (
                <li key={key} className="text-xs text-gray-500 flex justify-between">
                  <span>{key.replaceAll('_', ' ')}</span>
                  <span className="font-semibold text-gray-700">{count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {showNewProject && (
        <NewProjectModalComponent
          onClose={() => setShowNewProject(false)}
          onCreated={() => setShowNewProject(false)}
        />
      )}
    </div>
  )
}
