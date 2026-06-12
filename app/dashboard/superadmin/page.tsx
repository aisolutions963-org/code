'use client'

import { useState, useCallback, Fragment, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import useSWR, { mutate as globalMutate } from 'swr'
import { todayUAE } from '@/lib/dateUtils'
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { Project, MaintenanceRecord, Announcement, Payment, Task, TaskUpdateInput, Client } from '@/lib/types'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import TaskList from '@/components/tasks/TaskList'
import UnifiedCalendar, { TabDef } from '@/components/calendar/UnifiedCalendar'
import { useSession } from '@/app/dashboard/layout-client'
import ProjectNotesEditor from '@/components/projects/ProjectNotesEditor'
import AllMaterialsView from '@/components/materials/AllMaterialsView'

// ─── Types ───────────────────────────────────────────────────────────────────

type Page =
  | 'overview'
  | 'timeline'
  | 'phases'
  | 'activity'
  | 'payments'
  | 'calendar'
  | 'warranty'
  | 'users'
  | 'announcements'
  | 'projects'
  | 'tasks'
  | 'materials'

interface SedMember { id: string; name: string }

const UAE_EMIRATES = ['Dubai', 'Abu Dabei', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah']
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
const INTAKE_PATHS = [
  'Make Quotation',
  'Visit Site to Gather Details',
  'Assign Installation for Measurement',
  'Select Material / Order Samples',
  'Draft Proposal or Photo Ideas',
  'Client Clarifications & Sketches',
]

interface SuperadminMetrics {
  totalProjects: number
  activeProjects: number
  staleProjects: number
  pendingApprovals: number
  overduePayments: number
  totalRevenue: number
  totalPaid: number
  totalRemaining: number
  callClientTasks: { taskId: string; projectRef: string; projectName: string; clientName: string; clientPhone: string }[]
}

interface KpiCounts {
  total: number
  preparing: number
  open: number
  notApproved: number
  finished: number
  maintenanceActive: number
  finishedUnpaid: number
  maintenanceExpired: number
}

interface SedStat {
  sedName: string
  preparing: number
  open: number
  closed: number
  notApproved: number
  totalPaid: number
  commission: number
}

type ReportCategory = 'Sales' | 'Accountant' | 'Material' | 'Calendar' | 'Clients'

interface ReportItem {
  name: string
  description: string
  route: string
}

const REPORT_TABS: { category: ReportCategory; color: string; reports: ReportItem[] }[] = [
  {
    category: 'Sales',
    color: 'text-green-700 bg-green-50 border-green-200',
    reports: [
      { name: 'Quotations Pipeline', description: 'All quotes with status, SED, and amounts', route: 'quotations' },
      { name: 'SED Follow-Ups', description: 'Follow-up log with outcomes and next actions', route: 'follow-ups' },
      { name: 'Ongoing Projects', description: 'Per-item production status matrix', route: 'ongoing-projects' },
      { name: 'SED Projects Status', description: 'Project portfolio per SED with quote amounts', route: 'sed-projects' },
    ],
  },
  {
    category: 'Accountant',
    color: 'text-red-700 bg-red-50 border-red-200',
    reports: [
      { name: 'Payables', description: 'Supplier invoices and payments owed', route: 'payables' },
      { name: 'Receivables', description: 'Client outstanding balances and old debts', route: 'receivables' },
      { name: 'Quotation Line Items', description: 'Itemised scope and amounts per quotation', route: 'quotation-line-items' },
    ],
  },
  {
    category: 'Material',
    color: 'text-purple-700 bg-purple-50 border-purple-200',
    reports: [
      { name: 'Material Orders', description: 'All procurement orders and delivery status', route: 'material-orders' },
      { name: 'Production Timesheets', description: 'Weekly worker-hour log per project', route: 'timesheets' },
    ],
  },
  {
    category: 'Calendar',
    color: 'text-yellow-700 bg-yellow-50 border-yellow-200',
    reports: [],
  },
  {
    category: 'Clients',
    color: 'text-sky-700 bg-sky-50 border-sky-200',
    reports: [],
  },
]

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
    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
      <p className={`text-2xl font-bold ${color ?? 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Page 1: Overview ────────────────────────────────────────────────────────

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

function SedChart({ data, seds }: { data: SedStat[]; seds: string[] }) {
  const [selectedSed, setSelectedSed] = useState<string | null>(null)

  const chartData = selectedSed
    ? [
        { name: 'Preparing', value: data.find((d) => d.sedName === selectedSed)?.preparing ?? 0, fill: '#3b82f6' },
        { name: 'Open', value: data.find((d) => d.sedName === selectedSed)?.open ?? 0, fill: '#16a34a' },
        { name: 'Closed', value: data.find((d) => d.sedName === selectedSed)?.closed ?? 0, fill: '#f9a8d4' },
        { name: 'Not Approved', value: data.find((d) => d.sedName === selectedSed)?.notApproved ?? 0, fill: '#dc2626' },
      ]
    : data.map((d) => ({
        name: d.sedName,
        preparing: d.preparing,
        open: d.open,
        closed: d.closed,
        notApproved: d.notApproved,
      }))

  const maxVal = selectedSed
    ? Math.max(...(chartData as { value: number }[]).map((d) => d.value), 1)
    : Math.max(...data.map((d) => d.preparing + d.open + d.closed + d.notApproved), 1)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-gray-700">
          {selectedSed ? `${selectedSed}'s Projects` : 'SED Performance'}
        </p>
        <div className="flex gap-1 flex-wrap">
          {seds.map((s) => (
            <button
              key={s}
              onClick={() => setSelectedSed(selectedSed === s ? null : s)}
              className={`px-2.5 py-1 text-xs rounded-full border font-medium transition-colors ${
                selectedSed === s
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'text-gray-500 border-gray-200 hover:border-brand-300 hover:text-brand-600'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {/* Legend */}
        <div className="flex gap-4 text-xs text-gray-500 mb-3">
          {[
            { label: 'Preparing', color: '#3b82f6' },
            { label: 'Open', color: '#16a34a' },
            { label: 'Closed', color: '#f9a8d4' },
            { label: 'Not Approved', color: '#dc2626' },
          ].map((l) => (
            <span key={l.label} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={Math.max(120, (selectedSed ? 4 : data.length) * 40)}>
          {selectedSed ? (
            <BarChart
              layout="vertical"
              data={chartData as { name: string; value: number; fill: string }[]}
              margin={{ top: 0, right: 20, left: 80, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
              <XAxis type="number" domain={[0, maxVal]} allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="value" radius={[0, 3, 3, 0]} name="Projects">
                {(chartData as { name: string; value: number; fill: string }[]).map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <BarChart
              layout="vertical"
              data={chartData as { name: string; preparing: number; open: number; closed: number; notApproved: number }[]}
              margin={{ top: 0, right: 20, left: 80, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
              <XAxis type="number" domain={[0, maxVal]} allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="preparing" fill="#3b82f6" radius={[0, 3, 3, 0]} name="Preparing" stackId="a" />
              <Bar dataKey="open" fill="#16a34a" radius={[0, 0, 0, 0]} name="Open" stackId="a" />
              <Bar dataKey="closed" fill="#f9a8d4" radius={[0, 0, 0, 0]} name="Closed" stackId="a" />
              <Bar dataKey="notApproved" fill="#dc2626" radius={[0, 3, 3, 0]} name="Not Approved" stackId="a" />
            </BarChart>
          )}
        </ResponsiveContainer>

        {/* Commission summary table */}
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Commission (1.5% of paid)</p>
          <div className="space-y-1">
            {(selectedSed ? data.filter((d) => d.sedName === selectedSed) : data).map((d) => (
              <div key={d.sedName} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-gray-600 font-medium truncate">{d.sedName}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-gray-400">Paid: AED {d.totalPaid.toLocaleString()}</span>
                  <span className="font-semibold text-emerald-600">AED {d.commission.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Clients Report View ─────────────────────────────────────────────────────

function ClientsReportView() {
  const { data: clientsData, isLoading: clientsLoading } = useSWR<{ clients: Client[] }>('/api/clients', fetcher)
  const { data: projectsData, isLoading: projectsLoading } = useSWR<{ projects: Project[] }>('/api/projects', fetcher)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [dlError, setDlError] = useState<string | null>(null)

  const clients = clientsData?.clients ?? []
  const projects = projectsData?.projects ?? []

  const projectsByClient = useMemo(() => {
    const map = new Map<string, Project[]>()
    for (const p of projects) {
      const key = p.clientName.toLowerCase()
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return map
  }, [projects])

  const filtered = clients.filter((c) =>
    !search.trim() || c.clientName.toLowerCase().includes(search.toLowerCase()),
  )

  async function downloadClient(clientName: string) {
    setDownloading(clientName)
    setDlError(null)
    try {
      const res = await fetch(`/api/reports/download/client-projects?clientName=${encodeURIComponent(clientName)}`)
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Client_${clientName.replace(/\s+/g, '_')}_${todayUAE()}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setDlError('Download failed. Please try again.')
    } finally {
      setDownloading(null)
    }
  }

  const isLoading = clientsLoading || projectsLoading

  const STAGE_COLOR: Record<string, string> = {
    Preparing: 'bg-amber-100 text-amber-700',
    Open: 'bg-green-100 text-green-700',
    Production: 'bg-blue-100 text-blue-700',
    Closed: 'bg-gray-100 text-gray-500',
    'Not-Approved': 'bg-red-100 text-red-600',
    'Closed and active warranty': 'bg-teal-100 text-teal-700',
    'Warranty expired': 'bg-gray-100 text-gray-400',
  }

  return (
    <div className="space-y-3 pb-2">
      {dlError && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center justify-between">
          <span>{dlError}</span>
          <button onClick={() => setDlError(null)} className="ml-2 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
        </svg>
        <input
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Search clients…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">No clients found</p>
      )}

      {!isLoading && filtered.map((client) => {
        const clientProjects = projectsByClient.get(client.clientName.toLowerCase()) ?? []
        const isOpen = expanded === client.id
        const totalValue = clientProjects.reduce((s, p) => s + (p.projectTotalCost ?? 0), 0)
        const totalPaid = clientProjects.reduce((s, p) => s + (p.totalPaid ?? 0), 0)

        return (
          <div key={client.id} className="border border-gray-200 rounded-xl overflow-hidden">
            {/* Client header row */}
            <div className="flex items-center gap-3 px-4 py-3 bg-sky-50 hover:bg-sky-100 transition-colors">
              <button
                className="flex-1 flex items-center gap-3 text-left min-w-0"
                onClick={() => setExpanded(isOpen ? null : client.id)}
              >
                <div className="w-8 h-8 rounded-full bg-sky-200 flex items-center justify-center shrink-0 text-sky-700 font-bold text-sm">
                  {client.clientName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{client.clientName}</p>
                  <p className="text-xs text-gray-400">
                    {client.phone && <span className="mr-3">{client.phone}</span>}
                    <span>{clientProjects.length} project{clientProjects.length !== 1 ? 's' : ''}</span>
                    {totalValue > 0 && <span className="ml-3 text-sky-600 font-medium">AED {totalValue.toLocaleString()}</span>}
                  </p>
                </div>
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ml-auto ${isOpen ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <button
                onClick={() => downloadClient(client.clientName)}
                disabled={downloading === client.clientName}
                title="Download Excel report"
                className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-sky-300 text-sky-700 hover:bg-sky-200 disabled:opacity-50 transition-colors"
              >
                {downloading === client.clientName ? (
                  <div className="w-3 h-3 border border-sky-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                )}
                Excel
              </button>
            </div>

            {/* Expanded: project list */}
            {isOpen && (
              <div className="divide-y divide-gray-100">
                {clientProjects.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-gray-400 italic">No projects found for this client</p>
                ) : (
                  <>
                    {clientProjects.map((p) => (
                      <div key={p.id} className="px-4 py-3 flex items-start justify-between gap-3 hover:bg-gray-50">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-gray-400">{p.projectId}</span>
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STAGE_COLOR[p.projectStage] ?? 'bg-gray-100 text-gray-500'}`}
                            >
                              {p.projectStage}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-gray-800 mt-0.5 truncate">{p.projectName}</p>
                          {(p.emirate || p.location) && (
                            <p className="text-xs text-gray-400 truncate">{[p.emirate, p.location].filter(Boolean).join(' — ')}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0 text-xs">
                          {(p.projectTotalCost ?? 0) > 0 && (
                            <>
                              <p className="font-semibold text-gray-700">AED {(p.projectTotalCost ?? 0).toLocaleString()}</p>
                              <p className="text-gray-400">Paid: {(p.totalPaid ?? 0).toLocaleString()}</p>
                              {(p.remainingBalance ?? 0) > 0 && (
                                <p className="text-red-500">Due: {(p.remainingBalance ?? 0).toLocaleString()}</p>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                    {/* Summary row */}
                    <div className="px-4 py-2.5 bg-gray-50 flex justify-between text-xs font-semibold text-gray-600">
                      <span>{clientProjects.length} project{clientProjects.length !== 1 ? 's' : ''} total</span>
                      <span>
                        AED {totalValue.toLocaleString()} &nbsp;·&nbsp; Paid {totalPaid.toLocaleString()} &nbsp;·&nbsp;
                        <span className="text-red-500">Due {(totalValue - totalPaid).toLocaleString()}</span>
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Reports Section ─────────────────────────────────────────────────────────

function quarterBounds(year: number, q: number): { from: string; to: string; label: string } {
  const startMonth = (q - 1) * 3
  const from = new Date(year, startMonth, 1)
  const to   = new Date(year, startMonth + 3, 0) // last day of last month
  const fmt  = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const label = `${months[startMonth]} – ${months[startMonth + 2]} ${year}`
  return { from: fmt(from), to: fmt(to), label }
}

function ReportsSection() {
  const now = new Date()
  const curYear = now.getFullYear()
  const curQ    = Math.ceil((now.getMonth() + 1) / 3)

  const [activeTab, setActiveTab] = useState<ReportCategory>('Sales')
  const [downloading, setDownloading] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [year, setYear] = useState(curYear)
  const [q, setQ] = useState(curQ)

  const { from, to, label } = quarterBounds(year, q)

  async function downloadReport(route: string, name: string) {
    setDownloading(route)
    setDownloadError(null)
    try {
      const res = await fetch(`/api/reports/download/${route}?from=${from}&to=${to}`)
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${name.replace(/\s+/g, '_')}_Q${q}_${year}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setDownloadError('Download failed. Please try again.')
    } finally {
      setDownloading(null)
    }
  }

  const currentTab = REPORT_TABS.find((t) => t.category === activeTab)!
  const TAB_ACTIVE: Record<ReportCategory, string> = {
    Sales: 'bg-green-600 text-white border-green-600',
    Accountant: 'bg-red-600 text-white border-red-600',
    Material: 'bg-purple-600 text-white border-purple-600',
    Calendar: 'bg-yellow-500 text-white border-yellow-500',
    Clients: 'bg-sky-600 text-white border-sky-600',
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm font-semibold text-gray-700">Reports</p>
        {/* Quarter selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Year */}
          <div className="flex items-center gap-1">
            <button onClick={() => setYear(y => y - 1)} className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 text-xs">‹</button>
            <span className="text-xs font-semibold text-gray-700 w-10 text-center">{year}</span>
            <button onClick={() => setYear(y => y + 1)} disabled={year >= curYear} className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 text-xs disabled:opacity-30">›</button>
          </div>
          {/* Quarter buttons */}
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => setQ(n)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors ${
                  q === n ? 'bg-gray-800 text-white border-gray-800' : 'text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700'
                }`}
              >
                Q{n}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400">{label}</span>
        </div>
      </div>
      {/* Tabs */}
      <div className="flex gap-2 px-5 pt-4 pb-2">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.category}
            onClick={() => setActiveTab(tab.category)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
              activeTab === tab.category ? TAB_ACTIVE[tab.category] : 'text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            {tab.category}
          </button>
        ))}
      </div>

      {/* Download error */}
      {downloadError && (
        <div className="mx-5 mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center justify-between">
          <span>{downloadError}</span>
          <button onClick={() => setDownloadError(null)} className="ml-2 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Report list */}
      <div className={activeTab === 'Calendar' ? '' : 'px-5 pb-4'}>
        {activeTab === 'Calendar' ? (
          <CalendarPage />
        ) : activeTab === 'Clients' ? (
          <ClientsReportView />
        ) : currentTab.reports.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Coming soon</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {currentTab.reports.map((report) => (
              <div key={report.route} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">{report.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{report.description}</p>
                </div>
                <button
                  onClick={() => downloadReport(report.route, report.name)}
                  disabled={downloading === report.route}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 transition-colors"
                >
                  {downloading === report.route ? (
                    <div className="w-3 h-3 border border-gray-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  )}
                  Excel
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function OverviewPage() {
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
        <KpiCard label="Finished — Not Paid" value={kpi?.finishedUnpaid ?? 0} href={`${BASE_PROJECTS_URL}&stage=Closed&unpaid=true`} downloadHref="/api/reports/download/projects-by-stage?stage=Closed&unpaid=true" loading={kpiLoading} />
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

      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreated={() => setShowNewProject(false)}
        />
      )}
    </div>
  )
}



function ProjectRow({ project: p, onAdvance, onDelete, onReopen, onDisapprove, onNotesSaved }: { project: Project; onAdvance: (id: string) => Promise<void>; onDelete: (id: string, name: string) => Promise<void>; onReopen: (id: string) => Promise<void>; onDisapprove: (id: string) => Promise<void>; onNotesSaved?: () => void }) {
  const [loading, setLoading] = useState(false)
  const [genLoading, setGenLoading] = useState(false)
  const [reopenLoading, setReopenLoading] = useState(false)
  const [disapproveLoading, setDisapproveLoading] = useState(false)
  const [err, setErr] = useState('')
  const [genMsg, setGenMsg] = useState('')
  const [expanded, setExpanded] = useState(false)
  const stale = isStale(p.lastModifiedTasks)

  async function advance() {
    setLoading(true); setErr(''); setGenMsg('')
    try { await onAdvance(p.id) } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setLoading(false) }
  }

  async function reopen() {
    setReopenLoading(true); setErr('')
    try { await onReopen(p.id) } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setReopenLoading(false) }
  }

  async function disapprove() {
    if (!window.confirm(`Mark "${p.projectName}" as Not-Approved? This will notify the SED and manager.`)) return
    setDisapproveLoading(true); setErr('')
    try { await onDisapprove(p.id) } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setDisapproveLoading(false) }
  }

  async function generateTasks(force = false) {
    setGenLoading(true); setErr(''); setGenMsg('')
    try {
      const res = await fetch(`/api/projects/${p.id}/generate-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: p.projectStage, force }),
      })
      const data = await res.json()
      if (res.status === 409) {
        const ok = window.confirm(
          `${data.existingCount} tasks already exist for this project. Generate more anyway?`
        )
        if (ok) await generateTasks(true)
        return
      }
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      setGenMsg(`✓ Created ${data.created} tasks`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setGenLoading(false)
    }
  }

  const canGenerate = p.projectStage === 'Preparing' || p.projectStage === 'Open' || p.projectStage === 'Production'

  const address = [p.detailedLocation, p.location, p.emirate].filter(Boolean).join(', ')

  return (
    <>
      <tr className={`hover:bg-gray-50 transition-colors ${stale ? 'bg-yellow-50/30' : ''}`}>
        <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.projectId}</td>
        <td className="px-4 py-3 max-w-xs">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center gap-1.5 text-left group"
          >
            <svg
              className={`w-3 h-3 text-gray-400 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="font-medium text-gray-900 truncate group-hover:text-brand-600">{p.projectName}</span>
          </button>
          {p.nickname && <p className="text-xs text-gray-500 truncate mt-0.5 pl-5">{p.nickname}</p>}
          <div className="mt-1 pl-5">
            <ProjectNotesEditor
              projectId={p.id}
              initialNotes={p.managerNotes}
              editable
              onSaved={onNotesSaved}
            />
          </div>
        </td>
        <td className="px-4 py-3 text-gray-500 text-xs">{p.clientName}</td>
        <td className="px-4 py-3">
          <Badge variant={p.projectStage === 'Open' ? 'blue' : p.projectStage === 'Preparing' ? 'orange' : p.projectStage === 'Not-Approved' ? 'red' : p.projectStage === 'Production' ? 'green' : 'gray'}>
            {p.projectStage}
          </Badge>
        </td>
        <td className="px-4 py-3">
          {stale && <span className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-1.5 py-0.5">Stale</span>}
          {genMsg && <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5 ml-1">{genMsg}</span>}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            {canGenerate && (
              <Button size="sm" variant="secondary" loading={genLoading} onClick={() => generateTasks()}>
                ⚡ Tasks
              </Button>
            )}
            {p.projectStage !== 'Not-Approved' && p.projectStage !== 'Closed' && p.projectStage !== 'Closed and active warranty' && p.projectStage !== 'Warranty expired' && (
              <Button
                size="sm"
                variant="secondary"
                loading={disapproveLoading}
                onClick={disapprove}
                className="text-red-500 hover:text-red-700 border-red-200 hover:border-red-300"
              >
                ✕ Not Approved
              </Button>
            )}
            {p.projectStage === 'Not-Approved' && (
              <Button
                size="sm"
                variant="secondary"
                loading={reopenLoading}
                onClick={reopen}
                className="text-green-600 hover:text-green-700 border-green-300 hover:border-green-400"
              >
                ↩ Reopen
              </Button>
            )}
            {p.projectStage !== 'Closed' && p.projectStage !== 'Not-Approved' && p.projectStage !== 'Closed and active warranty' && p.projectStage !== 'Warranty expired' && (
              <Button size="sm" variant="secondary" loading={loading} onClick={advance}>Advance →</Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onDelete(p.id, p.projectName)}
              className="text-red-500 hover:text-red-700 border-red-200 hover:border-red-300"
            >
              Delete
            </Button>
          </div>
        </td>
      </tr>

      {/* Project Brief — F1 intake data */}
      {expanded && (
        <tr>
          <td colSpan={6} className="px-6 pb-5 pt-1 bg-gray-50/60 border-t border-gray-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-4 py-3">

              {p.projectDescription && (
                <div className="sm:col-span-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Scope</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{p.projectDescription}</p>
                </div>
              )}

              {address && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Address</p>
                  <p className="text-sm text-gray-700">{address}</p>
                </div>
              )}

              {p.clientPhone && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Client Phone</p>
                  <a href={`tel:${p.clientPhone}`} className="text-sm text-brand-600 hover:underline font-mono">{p.clientPhone}</a>
                </div>
              )}

              {p.paymentMode && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Payment Mode</p>
                  <p className="text-sm text-gray-700">{p.paymentMode}</p>
                </div>
              )}

              {p.salesOwner && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Sales Owner (SED)</p>
                  <p className="text-sm text-gray-700">{p.salesOwner.name ?? p.salesOwner.email}</p>
                </div>
              )}

              {p.communSeds && p.communSeds.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Community SEDs</p>
                  <p className="text-sm text-gray-700">{p.communSeds.join(', ')}</p>
                </div>
              )}

              {p.sedNotes && (
                <div className="sm:col-span-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">SED Notes</p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{p.sedNotes}</p>
                </div>
              )}

              {p.projectCreatedAt && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Created</p>
                  <p className="text-sm text-gray-500">
                    {new Date(p.projectCreatedAt).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              )}

            </div>
          </td>
        </tr>
      )}

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
    '/api/superadmin/timeline', fetcher, { refreshInterval: 300_000 },
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
    '/api/projects?all=true', fetcher, { refreshInterval: 300_000 },
  )
  const projects = (data?.projects ?? []).filter((p) => !['Closed', 'Archived'].includes(p.projectStage))

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
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
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

// ─── Page 4: Team Activity ────────────────────────────────────────────────────

type Dept = 'All' | 'SED' | 'Fabrication' | 'Installation' | 'Management'
const DEPTS: Dept[] = ['All', 'SED', 'Fabrication', 'Installation', 'Management']

interface TeamTask { id: string; taskName: string; status: string; department: string[]; projectRef: string; projectRecordId: string }
interface TeamGroup { name: string; role: string; userId: number; tasks: TeamTask[] }

const ROLE_LABELS: Record<string, string> = { superadmin: 'Superadmin', manager: 'Manager', sed: 'SED', fabrication: 'Fabrication', installation: 'Installation' }
const ROLE_COLORS: Record<string, string> = { superadmin: 'bg-brand-100 text-brand-700', manager: 'bg-green-100 text-green-700', sed: 'bg-purple-100 text-purple-700', fabrication: 'bg-amber-100 text-amber-700', installation: 'bg-blue-100 text-blue-700' }

function PersonSection({ group }: { group: TeamGroup }) {
  const [expanded, setExpanded] = useState(false)
  const roleLabel = ROLE_LABELS[group.role] ?? group.role
  const roleColor = ROLE_COLORS[group.role] ?? 'bg-gray-100 text-gray-600'
  const activeTasks = group.tasks.filter((t) => t.status !== 'Locked' && t.status !== 'Completed')
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button onClick={() => setExpanded((e) => !e)} className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-gray-500">{group.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</span>
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-900">{group.name}</p>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${roleColor}`}>{roleLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {activeTasks.length > 0 && (
            <span className="text-xs bg-brand-100 text-brand-700 font-semibold px-2 py-0.5 rounded-full">{activeTasks.length} active</span>
          )}
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-gray-100">
          {activeTasks.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-400">No active tasks.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Project</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Task</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Dept</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {activeTasks.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{t.projectRef || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-800 max-w-xs truncate">{t.taskName}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{t.department?.join(', ') || '—'}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={({ 'In Progress': 'blue', 'Completed': 'green', 'Pending Approval': 'orange', 'To Do': 'gray', 'Locked': 'gray' } as Record<string, 'blue'|'green'|'orange'|'gray'|'red'>)[t.status] ?? 'gray'} size="sm">{t.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

function ActivityPage() {
  const [viewMode, setViewMode] = useState<'task' | 'person'>('task')
  const [dept, setDept] = useState<Dept>('All')

  const { data, isLoading, mutate } = useSWR<{ tasks: Task[] }>(
    '/api/tasks', fetcher, { refreshInterval: 300_000 },
  )
  const { data: teamData, isLoading: teamLoading } = useSWR<{ groups: TeamGroup[] }>(
    viewMode === 'person' ? '/api/superadmin/team-tasks' : null,
    fetcher, { refreshInterval: 300_000 },
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Team Activity</h2>
          <p className="text-sm text-gray-500">{tasks.length} tasks across all departments</p>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg shrink-0">
          <button onClick={() => setViewMode('task')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === 'task' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>By Task</button>
          <button onClick={() => setViewMode('person')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === 'person' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>By Person</button>
        </div>
      </div>

      {viewMode === 'task' ? (
        <>
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
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
            {DEPTS.map((d) => (
              <button key={d} onClick={() => setDept(d)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${dept === d ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{d}</button>
            ))}
          </div>
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
                  {filtered.map((t) => {
                    const isCallClient = t.taskName.toLowerCase().includes('call the client') && t.status === 'To Do'
                    return (
                      <tr key={t.id} className={isCallClient ? 'bg-teal-50 border-l-4 border-l-teal-400' : 'hover:bg-gray-50'}>
                        <td className="px-3 py-2.5 text-center">
                          <button onClick={() => toggleFlag(t)} title="Toggle priority">
                            <span className={`text-sm ${t.priorityFlag ? 'text-red-500' : 'text-gray-200 hover:text-gray-400'}`}>⚑</span>
                          </button>
                        </td>
                        <td className="px-4 py-2.5 max-w-xs truncate">
                          {isCallClient ? (
                            <span className="flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5 text-teal-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              <span className="font-semibold text-teal-800">{t.taskName}</span>
                            </span>
                          ) : (
                            <span className="text-gray-800">{t.taskName}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">{t.department?.join(', ') ?? '—'}</td>
                        <td className="px-4 py-2.5"><TaskStatusBadge status={t.status} /></td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{t.projectRef ?? t.project?.[0] ?? '—'}</td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-8 text-sm text-gray-400">No tasks.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          {teamLoading ? <Spinner /> : (teamData?.groups ?? []).length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-sm text-gray-400">No active tasks found across the team.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(teamData?.groups ?? []).map((g) => <PersonSection key={`${g.name}-${g.role}`} group={g} />)}
            </div>
          )}
        </>
      )}
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
    '/api/projects?all=true', fetcher, { refreshInterval: 300_000 },
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

  const today = todayUAE()
  const [form, setForm] = useState({
    amount: '',
    paymentType: 'Advance',
    paymentStatus: 'Received',
    paymentMethod: 'Bank Transfer',
    referenceNo: '',
    receivedDate: today,
    dueDate: '',
    payerType: '',
    payerName: '',
    commission: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [ferr, setFerr] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<typeof form | null>(null)
  const [editErr, setEditErr] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [cancelling, setCancelling] = useState<string | null>(null)

  function setF(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }
  function setEF(key: string, value: string) {
    setEditForm((f) => f ? { ...f, [key]: value } : f)
  }

  function startEdit(pm: Payment) {
    setEditingId(pm.id)
    setEditErr('')
    setEditForm({
      amount: pm.amount.toString(),
      paymentType: pm.paymentType,
      paymentStatus: pm.paymentStatus,
      paymentMethod: pm.paymentMethod,
      referenceNo: pm.referenceNo ?? '',
      receivedDate: pm.receivedDate ?? '',
      dueDate: pm.dueDate ?? '',
      payerType: pm.payerType ?? '',
      payerName: pm.payerName ?? '',
      commission: pm.commissionAmount?.toString() ?? '',
      notes: pm.notes ?? '',
    })
    setShowForm(false)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditForm(null)
    setEditErr('')
  }

  async function doVoid(pm: Payment) {
    if (!confirm(`Void this ${pm.paymentType} payment of AED ${pm.amount.toLocaleString()}? This cannot be undone.`)) return
    setCancelling(pm.id)
    try {
      const res = await fetch(`/api/payments/${pm.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentStatus: 'Cancelled' }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setFerr((d as { error?: string }).error ?? 'Failed to void payment') }
      else { mutate(); globalMutate('/api/projects?all=true') }
    } catch { setFerr('Failed to void payment') }
    finally { setCancelling(null) }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingId || !editForm) return
    if (!editForm.amount || parseFloat(editForm.amount) <= 0) { setEditErr('Amount is required'); return }
    setEditSaving(true); setEditErr('')
    try {
      const body: Record<string, unknown> = {
        amount: parseFloat(editForm.amount),
        paymentType: editForm.paymentType,
        paymentStatus: editForm.paymentStatus,
        paymentMethod: editForm.paymentMethod,
      }
      if (editForm.referenceNo.trim()) body.referenceNo = editForm.referenceNo.trim()
      if (editForm.receivedDate) body.receivedDate = editForm.receivedDate
      if (editForm.dueDate) body.dueDate = editForm.dueDate
      if (editForm.payerType) body.payerType = editForm.payerType
      if (editForm.payerName.trim()) body.payerName = editForm.payerName.trim()
      if (editForm.payerType === 'Broker' && editForm.commission) body.commissionAmount = parseFloat(editForm.commission)
      if (editForm.notes.trim()) body.notes = editForm.notes.trim()
      const res = await fetch(`/api/payments/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setEditErr((d as { error?: string }).error ?? 'Failed to update') }
      else { cancelEdit(); mutate(); globalMutate('/api/projects?all=true') }
    } catch { setEditErr('Failed to update payment') }
    finally { setEditSaving(false) }
  }

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!form.amount || parseFloat(form.amount) <= 0) { setFerr('Amount is required'); return }
    if (!form.receivedDate) { setFerr('Date is required'); return }
    if (!form.referenceNo.trim()) { setFerr('Reference No. is required'); return }
    if (!form.payerType) { setFerr('Payer Type is required'); return }
    setSaving(true); setFerr(''); setSaved(false)
    try {
      const body: Record<string, unknown> = {
        project: [p.id],
        amount: parseFloat(form.amount),
        paymentType: form.paymentType,
        paymentStatus: form.paymentStatus,
        paymentMethod: form.paymentMethod,
        referenceNo: form.referenceNo.trim(),
        receivedDate: form.receivedDate,
        payerType: form.payerType,
      }
      if (form.dueDate) body.dueDate = form.dueDate
      if (form.payerName.trim()) body.payerName = form.payerName.trim()
      if (form.payerType === 'Broker' && form.commission) body.commissionAmount = parseFloat(form.commission)
      if (form.notes.trim()) body.notes = form.notes.trim()

      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed')
      }
      setSaved(true)
      setForm({ amount: '', paymentType: 'Advance', paymentStatus: 'Received', paymentMethod: 'Bank Transfer', referenceNo: '', receivedDate: today, dueDate: '', payerType: '', payerName: '', commission: '', notes: '' })
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
      {ferr && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{ferr}</p>}
      {payments.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500">
              <th className="text-left py-1 pr-3">Type</th>
              <th className="text-left py-1 pr-3">Status</th>
              <th className="text-right py-1 pr-3">Amount</th>
              <th className="text-left py-1 pr-3">Method</th>
              <th className="text-left py-1 pr-3">Date</th>
              <th className="text-left py-1 pr-3">Stage</th>
              <th className="text-right py-1">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {payments.map((pm) => (
              <Fragment key={pm.id}>
                <tr className={pm.paymentStatus === 'Cancelled' ? 'opacity-50 line-through' : ''}>
                  <td className="py-1.5 pr-3 text-gray-700">{pm.paymentType}</td>
                  <td className="py-1.5 pr-3">
                    <Badge variant={pm.paymentStatus === 'Received' ? 'green' : pm.paymentStatus === 'Pending' ? 'orange' : 'gray'} size="sm">
                      {pm.paymentStatus}
                    </Badge>
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono text-gray-800">AED {pm.amount.toLocaleString()}</td>
                  <td className="py-1.5 pr-3 text-gray-500">{pm.paymentMethod}</td>
                  <td className="py-1.5 pr-3 text-gray-400">{pm.receivedDate ?? pm.dueDate ?? '—'}</td>
                  <td className="py-1.5 pr-3 text-gray-400">{pm.stageAtPayment ?? '—'}</td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => editingId === pm.id ? cancelEdit() : startEdit(pm)}
                      className="text-xs text-blue-600 hover:underline mr-2"
                    >
                      {editingId === pm.id ? 'Discard' : 'Edit'}
                    </button>
                    {pm.paymentStatus !== 'Cancelled' && (
                      <button
                        onClick={() => doVoid(pm)}
                        disabled={cancelling === pm.id}
                        className="text-xs text-red-500 hover:underline disabled:opacity-50"
                      >
                        {cancelling === pm.id ? '…' : 'Void'}
                      </button>
                    )}
                  </td>
                </tr>
                {editingId === pm.id && editForm && (
                  <tr>
                    <td colSpan={7} className="pb-3 pt-1 bg-blue-50/50">
                      <form onSubmit={submitEdit} className="grid grid-cols-2 gap-3 p-3 bg-white rounded-lg border border-blue-200">
                        {editErr && <p className="col-span-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{editErr}</p>}
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Date</label>
                          <input type="date" value={editForm.receivedDate} onChange={(e) => setEF('receivedDate', e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Amount (AED) *</label>
                          <input type="number" min="0" step="0.01" value={editForm.amount} onChange={(e) => setEF('amount', e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Type</label>
                          <select value={editForm.paymentType} onChange={(e) => setEF('paymentType', e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                            {['Advance', 'Delivery', 'Material', 'Final', 'Progressive Payment'].map((v) => <option key={v}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Status</label>
                          <select value={editForm.paymentStatus} onChange={(e) => setEF('paymentStatus', e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                            {['Received', 'Pending', 'Overdue', 'Cancelled'].map((v) => <option key={v}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Method</label>
                          <select value={editForm.paymentMethod} onChange={(e) => setEF('paymentMethod', e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                            {['Bank Transfer', 'Cash', 'Cheque'].map((v) => <option key={v}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Reference No.</label>
                          <input type="text" value={editForm.referenceNo} onChange={(e) => setEF('referenceNo', e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Payer Type</label>
                          <select value={editForm.payerType} onChange={(e) => setEF('payerType', e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                            <option value="">— select —</option>
                            {['Broker', 'Contractor', 'End User', 'Designer'].map((v) => <option key={v}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Payer Name</label>
                          <input type="text" value={editForm.payerName} onChange={(e) => setEF('payerName', e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                        </div>
                        {editForm.payerType === 'Broker' && (
                          <div className="col-span-2">
                            <label className="text-xs text-gray-500 block mb-1">Commission Amount (AED)</label>
                            <input type="number" min="0" step="0.01" value={editForm.commission} onChange={(e) => setEF('commission', e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                          </div>
                        )}
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Due Date</label>
                          <input type="date" value={editForm.dueDate} onChange={(e) => setEF('dueDate', e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Notes</label>
                          <input type="text" value={editForm.notes} onChange={(e) => setEF('notes', e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                        </div>
                        <div className="col-span-2 flex items-center gap-3">
                          <Button type="submit" size="sm" loading={editSaving}>Update Payment</Button>
                          <button type="button" onClick={cancelEdit} className="text-xs text-gray-500 hover:underline">Discard</button>
                        </div>
                      </form>
                    </td>
                  </tr>
                )}
              </Fragment>
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
          {ferr && <p className="col-span-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{ferr}</p>}

          <div>
            <label className="text-xs text-gray-500 block mb-1">Date *</label>
            <input type="date" value={form.receivedDate} onChange={(e) => setF('receivedDate', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Amount (AED) *</label>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setF('amount', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="0.00" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Type *</label>
            <select value={form.paymentType} onChange={(e) => setF('paymentType', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              {['Advance', 'Delivery', 'Material', 'Final', 'Progressive Payment'].map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Status *</label>
            <select value={form.paymentStatus} onChange={(e) => setF('paymentStatus', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              {['Received', 'Pending', 'Overdue'].map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Method *</label>
            <select value={form.paymentMethod} onChange={(e) => setF('paymentMethod', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              {['Bank Transfer', 'Cash', 'Cheque'].map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Reference No. *</label>
            <input type="text" value={form.referenceNo} onChange={(e) => setF('referenceNo', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="TRN / cheque no." />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Payer Type *</label>
            <select value={form.payerType} onChange={(e) => setF('payerType', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">— select —</option>
              {['Broker', 'Contractor', 'End User', 'Designer'].map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Payer Name</label>
            <input type="text" value={form.payerName} onChange={(e) => setF('payerName', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="Full name" />
          </div>
          {form.payerType === 'Broker' && (
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Commission Amount (AED)</label>
              <input type="number" min="0" step="0.01" value={form.commission} onChange={(e) => setF('commission', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="0.00" />
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500 block mb-1">Due Date</label>
            <input type="date" value={form.dueDate} onChange={(e) => setF('dueDate', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Notes</label>
            <input type="text" value={form.notes} onChange={(e) => setF('notes', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="Optional" />
          </div>
          <div className="col-span-2 flex items-center gap-3">
            <Button type="submit" size="sm" loading={saving}>Save Payment</Button>
            {saved && <span className="text-xs text-green-600">Saved.</span>}
          </div>
        </form>
      )}
    </div>
  )
}

// ─── Page 6: Warranty Tracker ─────────────────────────────────────────────────

function WarrantyPage() {
  const { data, isLoading } = useSWR<{ records: MaintenanceWithExtra[] }>(
    '/api/maintenance', fetcher, { refreshInterval: 300_000 },
  )
  const records = data?.records ?? []

  const expired = records.filter((r) => r.daysRemaining < 0).length
  const expiringSoon = records.filter((r) => r.daysRemaining >= 0 && r.daysRemaining < 30).length

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
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
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
  // Redirect to the dedicated users sub-page which has the full management UI
  if (typeof window !== 'undefined') {
    window.location.replace('/dashboard/superadmin/users')
  }
  return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
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
  visibleTo: 'Everyone',
  expiresAt: '',
}

function AnnouncementsPage() {
  const { data, isLoading, mutate } = useSWR<{ announcements: Announcement[] }>(
    '/api/announcements', fetcher, { refreshInterval: 300_000 },
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
          <p className="text-sm font-semibold text-gray-700">{editing === 'new' ? 'New Announcement' : 'Edit Announcement'}</p>
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
                {['Everyone', 'Superadmin', 'Manager', 'SED', 'Fabrication', 'Installation'].map((v) => (
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

// ─── Page 9: Calendar ─────────────────────────────────────────────────────────

function CalendarPage() {
  const { name } = useSession()

  const tabs: TabDef[] = [
    { id: 'all',          label: 'All',               dot: 'bg-gray-400',   types: null,                                                  noAdd: true },
    { id: 'activity',     label: 'Project Activity',  dot: 'bg-amber-400',  types: ['activity', 'fabrication'],                           canAddEvent: true },
    { id: 'payments',     label: 'Payments',          dot: 'bg-green-500',  types: ['payment-received', 'payment-due', 'delivery'],        noAdd: true },
    { id: 'personal',     label: 'My Activities',     dot: 'bg-purple-400', types: ['activity'], creatorFilter: name ?? undefined,         canAddEvent: true },
    { id: 'installation', label: 'Installation',      dot: 'bg-blue-500',   types: ['installation', 'fabrication', 'delivery'],            showInstallAssign: true, canAddEvent: true },
    { id: 'materials',    label: 'Material Delivery', dot: 'bg-yellow-400', types: ['delivery'],                                          noAdd: true },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Calendars</h2>
        <p className="text-sm text-gray-500">All project and operational timelines in one place</p>
      </div>
      <UnifiedCalendar tabs={tabs} />
    </div>
  )
}

// ─── New Project Modal ────────────────────────────────────────────────────────

function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [selectedSedId, setSelectedSedId] = useState('')
  const [form, setForm] = useState({
    projectName: '',
    nickname: '',
    clientName: '',
    projectDescription: '',
    detailedLocation: '',
    paymentMode: '' as '' | 'Standard' | 'Progressive',

    clientPhone: '',
    emirate: '',
    location: '',
    sedNotes: '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<{ projectId: string; tasksCreated: number; warning?: string } | null>(null)

  const { data: sedData } = useSWR<{ members: SedMember[] }>('/api/team/sed', fetcher)
  const sedMembers = sedData?.members ?? []

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    const missing: string[] = []
    if (!selectedSedId) missing.push('SED Owner')
    if (!form.projectName.trim()) missing.push('Project Name')
    if (!form.nickname.trim()) missing.push('Nickname')
    if (!form.clientName.trim()) missing.push('Client Name')
    if (!form.projectDescription.trim()) missing.push('Project Scope')
    if (!form.detailedLocation.trim()) missing.push('Exact Location')
    if (!form.paymentMode) missing.push('Payment Mode')
    if (missing.length > 0) { setErr(`Required: ${missing.join(', ')}`); return }

    setSaving(true); setErr('')
    try {
      const body: Record<string, unknown> = {
        projectName: form.projectName.trim(),
        nickname: form.nickname.trim(),
        clientName: form.clientName.trim(),
        projectDescription: form.projectDescription,
        detailedLocation: form.detailedLocation,
        paymentMode: form.paymentMode,

        salesOwnerCollaboratorId: selectedSedId,
      }
      if (form.clientPhone) body.clientPhone = form.clientPhone
      if (form.emirate) body.emirate = form.emirate
      if (form.location) body.location = form.location
      if (form.sedNotes) body.sedNotes = form.sedNotes

      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create project')
      setResult({ projectId: data.project.projectId, tasksCreated: data.tasksCreated, warning: data.warning })
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create project')
    } finally {
      setSaving(false)
    }
  }

  if (result) {
    return (
      <Modal open onClose={onClose} title="Project Created">
        <div className="space-y-3 text-sm">
          <p className="text-green-700 font-medium">
            Project <span className="font-mono">{result.projectId}</span> created successfully.
          </p>
          {result.tasksCreated > 0 && (
            <p className="text-gray-600">{result.tasksCreated} Phase 1 tasks generated automatically.</p>
          )}
          {result.warning && (
            <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">{result.warning}</p>
          )}
          <div className="pt-2"><Button onClick={onClose}>Close</Button></div>
        </div>
      </Modal>
    )
  }

  const showLocation = form.emirate === 'Dubai' || form.emirate === ''

  return (
    <Modal
      open
      onClose={onClose}
      title="New Project"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>Create Project</Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {err && (
          <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{err}</p>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <label className="block text-xs font-medium text-amber-800 mb-1">
            SED Owner <span className="text-red-500">*</span>
          </label>
          <select
            className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            value={selectedSedId}
            onChange={(e) => setSelectedSedId(e.target.value)}
          >
            <option value="">— select SED —</option>
            {sedMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <p className="text-xs text-amber-700 mt-1">Project will be assigned to this SED. Superadmin cannot be the owner.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Project Name *</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.projectName}
              onChange={(e) => set('projectName', e.target.value)}
              placeholder="Full official project name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nickname *</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.nickname}
              onChange={(e) => set('nickname', e.target.value)}
              placeholder="Short internal reference"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Client Name *</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.clientName}
              onChange={(e) => set('clientName', e.target.value)}
              placeholder="Full name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Client Phone</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.clientPhone}
              onChange={(e) => set('clientPhone', e.target.value)}
              placeholder="+971 50 XXX XXXX"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Project Scope *</label>
            <textarea
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              value={form.projectDescription}
              onChange={(e) => set('projectDescription', e.target.value)}
              placeholder="What is being fabricated / installed?"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Exact Location *</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={form.detailedLocation}
              onChange={(e) => set('detailedLocation', e.target.value)}
              placeholder="Building, floor, unit, city"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Emirate</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              value={form.emirate}
              onChange={(e) => { set('emirate', e.target.value); set('location', '') }}
            >
              <option value="">— select —</option>
              {UAE_EMIRATES.map((e) => <option key={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Area {!showLocation && <span className="text-gray-400 font-normal">(Dubai only)</span>}
            </label>
            {showLocation ? (
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                value={form.location}
                onChange={(e) => set('location', e.target.value)}
              >
                <option value="">— select area —</option>
                {DUBAI_LOCATIONS.map((l) => <option key={l}>{l}</option>)}
              </select>
            ) : (
              <input
                disabled
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400"
                placeholder="Select Dubai to pick an area"
              />
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Payment Mode *</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              value={form.paymentMode}
              onChange={(e) => set('paymentMode', e.target.value as '' | 'Standard' | 'Progressive')}
            >
              <option value="">— select —</option>
              <option>Standard</option>
              <option>Progressive</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              value={form.sedNotes}
              onChange={(e) => set('sedNotes', e.target.value)}
              placeholder="General notes..."
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Follow Up Decision Panel ─────────────────────────────────────────────────

type FollowUpChoice = 'Reject Project' | 'SED to Follow Up' | 'Manager to Follow Up'

function FollowUpDecisionPanel({ task, onDone }: { task: Task; onDone: () => void }) {
  const [choice, setChoice] = useState<FollowUpChoice | ''>('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const options: { value: FollowUpChoice; label: string; desc: string; color: string }[] = [
    {
      value: 'Reject Project',
      label: 'Reject project',
      desc: 'Mark project as Not-Approved. SED and manager will be notified.',
      color: 'border-red-300 bg-red-50 hover:bg-red-100 text-red-800',
    },
    {
      value: 'SED to Follow Up',
      label: 'Ask SED to take action',
      desc: 'Notify the assigned SED to follow up with the client or take next steps.',
      color: 'border-green-300 bg-green-50 hover:bg-green-100 text-green-800',
    },
    {
      value: 'Manager to Follow Up',
      label: 'Ask manager to follow up',
      desc: 'Notify the manager to contact the client or coordinate with SED.',
      color: 'border-yellow-300 bg-yellow-50 hover:bg-yellow-100 text-yellow-800',
    },
  ]

  async function submit() {
    if (!choice) return
    setSaving(true); setErr('')
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { followUpOutcome: choice, status: 'Completed' } }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed') }
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
      setSaving(false)
    }
  }

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <p className="text-sm font-semibold text-amber-800">
          Inactivity detected — {task.projectRef ?? ''} {task.projectName ? `— ${task.projectName}` : ''}
        </p>
      </div>
      <p className="text-xs text-amber-700">This project has had no activity for 3+ days. Choose an action:</p>
      <div className="space-y-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setChoice(o.value)}
            className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${choice === o.value ? 'ring-2 ring-offset-1 ring-amber-400 ' : ''}${o.color}`}
          >
            <p className="font-semibold">{o.label}</p>
            <p className="text-xs opacity-80 mt-0.5">{o.desc}</p>
          </button>
        ))}
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <button
        type="button"
        disabled={!choice || saving}
        onClick={submit}
        className="w-full py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-40 transition-colors"
      >
        {saving ? 'Saving…' : 'Confirm decision'}
      </button>
    </div>
  )
}

// ─── Page 10: My Tasks ────────────────────────────────────────────────────────

function MyTasksPage() {
  const { data, error, isLoading, mutate } = useSWR<{ tasks: Task[] }>(
    '/api/tasks',
    fetcher,
    { refreshInterval: 300_000 },
  )
  const allTasks = data?.tasks ?? []

  // Superadmin sees: tasks pending their approval, Call the Client decisions, Follow Up decisions.
  // Manager/Purchase department tasks belong to the manager role — excluded here.
  const tasks = allTasks.filter(
    (t) =>
      t.status === 'Pending Approval' ||
      t.taskName.toLowerCase().includes('call the client') ||
      t.taskName === 'Follow Up',
  )

  const callClientReady = allTasks.filter(
    (t) => t.taskName.toLowerCase().startsWith('call the client') && t.status === 'To Do',
  )

  const followUpTasks = tasks.filter(
    (t) => t.taskName === 'Follow Up' && t.status === 'To Do',
  )

  const regularTasks = tasks.filter(
    (t) => !(t.taskName === 'Follow Up' && t.status === 'To Do'),
  )

  async function handleUpdate(id: string, fields: Partial<TaskUpdateInput>) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })
    if (!res.ok) {
      const body = await res.json()
      throw new Error(body.error ?? 'Failed')
    }
    mutate()
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">My Tasks</h2>
        <p className="text-sm text-gray-500">Decisions and approvals requiring your attention</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          Failed to load tasks. <button onClick={() => mutate()} className="underline">Retry</button>
        </div>
      )}

      {/* Call-client banner */}
      {callClientReady.length > 0 && (
        <div className="bg-teal-50 border-2 border-teal-400 rounded-xl px-4 py-4">
          <div className="flex items-center gap-2.5 mb-2">
            <svg className="w-5 h-5 text-teal-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <p className="text-sm font-bold text-teal-800">
              {callClientReady.length} project{callClientReady.length > 1 ? 's' : ''} ready — call client for final confirmation
            </p>
          </div>
          <ul className="space-y-1.5 ml-7">
            {callClientReady.map((t) => (
              <li key={t.id} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0 mt-1.5" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-xs font-mono text-teal-700 font-semibold">{t.projectRef ?? ''}</span>
                    <span className="text-xs text-teal-800">{t.projectName}</span>
                  </div>
                  {t.clientPhone && (
                    <a href={`tel:${t.clientPhone}`} className="text-xs font-semibold text-teal-700 hover:text-teal-900 underline underline-offset-2">
                      {t.clientPhone}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Inactivity Follow Up panels */}
      {followUpTasks.map((t) => (
        <FollowUpDecisionPanel key={t.id} task={t} onDone={mutate} />
      ))}

      <TaskList loading={isLoading} tasks={regularTasks} role="superadmin" onUpdate={handleUpdate} />
    </div>
  )
}

// ─── Materials ────────────────────────────────────────────────────────────────

function MaterialsPage() {
  return <AllMaterialsView role="superadmin" />
}

// ─── Page: All Projects ───────────────────────────────────────────────────────

function ProjectsPage() {
  const searchParams = useSearchParams()
  const stageFilter = searchParams.get('stage') ?? null
  const unpaidFilter = searchParams.get('unpaid') === 'true'
  const [search, setSearch] = useState('')

  const { data, isLoading, mutate } = useSWR<{ projects: Project[] }>(
    '/api/projects?all=true', fetcher, { refreshInterval: 300_000 },
  )

  const allProjects = data?.projects ?? []
  let filtered = stageFilter ? allProjects.filter((p) => p.projectStage === stageFilter) : allProjects
  if (unpaidFilter) filtered = filtered.filter((p) => (p.remainingBalance ?? 0) > 0)
  if (search.trim()) {
    const q = search.toLowerCase()
    filtered = filtered.filter((p) =>
      p.projectName.toLowerCase().includes(q) ||
      p.clientName.toLowerCase().includes(q) ||
      (p.quotationNumber ?? '').toLowerCase().includes(q) ||
      (p.quotationReference ?? '').toLowerCase().includes(q) ||
      (p.projectId ?? '').toLowerCase().includes(q) ||
      (p.nickname ?? '').toLowerCase().includes(q),
    )
  }

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

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error((d as { error?: string }).error ?? 'Failed to delete')
    }
    mutate()
  }

  async function handleReopen(id: string) {
    const res = await fetch(`/api/projects/${id}/reopen`, { method: 'POST' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error((d as { error?: string }).error ?? 'Failed to reopen')
    }
    mutate()
  }

  async function handleDisapprove(id: string) {
    const res = await fetch(`/api/projects/${id}/disapprove`, { method: 'POST' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error((d as { error?: string }).error ?? 'Failed to disapprove')
    }
    mutate()
  }

  const title = stageFilter ? `Projects — ${stageFilter}` : 'All Projects'

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {!isLoading && (
            <p className="text-sm text-gray-500">
              {filtered.length} project{filtered.length !== 1 ? 's' : ''}
              {unpaidFilter ? ' — balance outstanding' : ''}
            </p>
          )}
        </div>
        <Link href="/dashboard/superadmin" className="text-xs text-brand-600 hover:text-brand-700 font-medium">
          ← Overview
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by project name, client, quotation number…"
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ×
          </button>
        )}
      </div>

      {isLoading && <Spinner />}

      {!isLoading && filtered.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center">
          <p className="text-sm text-gray-400">{search ? `No projects match "${search}"` : 'No projects found.'}</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Ref</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Project</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Stage</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((p) => (
                  <ProjectRow
                    key={p.id}
                    project={p}
                    onAdvance={handleAdvance}
                    onDelete={handleDelete}
                    onReopen={handleReopen}
                    onDisapprove={handleDisapprove}
                    onNotesSaved={() => mutate()}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

const VALID_PAGES = new Set<Page>(['overview','timeline','phases','activity','payments','calendar','warranty','users','announcements','projects','tasks','materials'])

export default function SuperadminDashboard() {
  const searchParams = useSearchParams()
  const viewParam = searchParams.get('view') as Page | null
  const page: Page = viewParam && VALID_PAGES.has(viewParam) ? viewParam : 'overview'

  return (
    <div className="p-6 min-w-0">
      {page === 'overview' && <OverviewPage />}
      {page === 'timeline' && <TimelinePage />}
      {page === 'phases' && <PhasesPage />}
      {page === 'activity' && <ActivityPage />}
      {page === 'payments' && <PaymentsPage />}
      {page === 'calendar' && <CalendarPage />}
      {page === 'warranty' && <WarrantyPage />}
      {page === 'users' && <UsersPage />}
      {page === 'announcements' && <AnnouncementsPage />}
      {page === 'projects' && <ProjectsPage />}
      {page === 'tasks' && <MyTasksPage />}
      {page === 'materials' && <MaterialsPage />}
    </div>
  )
}
