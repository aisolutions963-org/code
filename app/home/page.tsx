'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Announcement, Project, Task } from '@/lib/types'
import { useSession } from '@/app/dashboard/layout-client'

interface CalendarEvent {
  id: string
  title: string
  date: string
  type: 'installation' | 'delivery' | 'activity'
  projectId?: string
}

interface HomeData {
  announcements: Announcement[]
  events: CalendarEvent[]
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const ROLE_LABELS: Record<string, string> = {
  fix: 'Installation Team',
  sed: 'SED',
  fab: 'Fabrication',
  mgr: 'Manager',
  superadmin: 'Superadmin',
}

function LiveClock() {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const dateStr = time.toLocaleDateString('en-AE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const timeStr = time.toLocaleTimeString('en-AE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })

  return (
    <div className="text-center">
      <p className="text-4xl font-bold text-white tabular-nums">{timeStr}</p>
      <p className="text-gray-400 mt-1 text-sm">{dateStr}</p>
    </div>
  )
}

function AnnouncementCard({ ann }: { ann: Announcement }) {
  return (
    <div className={`rounded-xl border p-4 ${ann.pinned ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
      <div className="flex items-start gap-2">
        {ann.pinned && <span className="text-amber-500 shrink-0 mt-0.5">📌</span>}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{ann.title}</p>
          {ann.message && (
            <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{ann.message}</p>
          )}
          {ann.expiresAt && (
            <p className="text-xs text-gray-400 mt-1.5">Expires: {ann.expiresAt}</p>
          )}
        </div>
      </div>
    </div>
  )
}

type CalendarType = 'installation' | 'activity'

function MiniCalendar({
  type,
  events,
}: {
  type: CalendarType
  events: CalendarEvent[]
}) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const title = type === 'installation' ? 'Installation & Delivery Calendar' : 'Project Activity Calendar'
  const filtered = events.filter((e) =>
    type === 'installation' ? e.type === 'installation' || e.type === 'delivery' : e.type === 'activity',
  )

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const todayStr = new Date().toISOString().slice(0, 10)

  const eventsByDate: Record<string, CalendarEvent[]> = {}
  for (const ev of filtered) {
    const d = ev.date.slice(0, 10)
    if (d.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)) {
      if (!eventsByDate[d]) eventsByDate[d] = []
      eventsByDate[d].push(ev)
    }
  }

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1))

  const monthLabel = currentMonth.toLocaleDateString('en-AE', { month: 'long', year: 'numeric' })

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-xs font-medium text-gray-600 min-w-[120px] text-center">{monthLabel}</span>
          <button
            onClick={nextMonth}
            className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-3">
        <div className="grid grid-cols-7 mb-1">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
            <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} />
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const evs = eventsByDate[dateStr] ?? []
            const isToday = dateStr === todayStr
            return (
              <div
                key={dateStr}
                className={`relative flex flex-col items-center py-1 rounded-lg cursor-default group
                  ${isToday ? 'bg-brand-500' : evs.length > 0 ? 'hover:bg-gray-50' : ''}`}
              >
                <span className={`text-xs font-medium ${isToday ? 'text-white' : 'text-gray-700'}`}>
                  {day}
                </span>
                {evs.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                    {evs.slice(0, 3).map((ev) => (
                      <span
                        key={ev.id}
                        className={`w-1.5 h-1.5 rounded-full ${
                          ev.type === 'installation' ? 'bg-blue-500' :
                          ev.type === 'delivery' ? 'bg-green-500' : 'bg-amber-400'
                        }`}
                        title={ev.title}
                      />
                    ))}
                    {evs.length > 3 && (
                      <span className="text-[9px] text-gray-400">+{evs.length - 3}</span>
                    )}
                  </div>
                )}
                {evs.length > 0 && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-10 hidden group-hover:block w-48 bg-gray-900 text-white text-xs rounded-lg p-2 shadow-lg pointer-events-none">
                    {evs.map((ev) => (
                      <div key={ev.id} className="truncate">{ev.title}</div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="px-3 pb-3 flex gap-3 flex-wrap">
        {type === 'installation' ? (
          <>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <span className="w-2 h-2 rounded-full bg-blue-500" />Installation
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <span className="w-2 h-2 rounded-full bg-green-500" />Delivery
            </span>
          </>
        ) : (
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full bg-amber-400" />Activity
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Project Pipeline ─────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { key: 'Preparing', label: 'Preparing' },
  { key: 'Open', label: 'Open' },
  { key: 'Production', label: 'Production' },
  { key: 'Fixing', label: 'Fixing' },
] as const

type PipelineStage = typeof PIPELINE_STAGES[number]['key']

const STAGE_STYLES: Record<PipelineStage, {
  header: string; bar: string; badge: string; card: string; dot: string
}> = {
  Preparing: {
    header: 'text-orange-400',
    bar: 'bg-orange-500',
    badge: 'bg-orange-500/20 text-orange-300',
    card: 'border-orange-500/20 hover:border-orange-400/40',
    dot: 'bg-orange-400',
  },
  Open: {
    header: 'text-blue-400',
    bar: 'bg-blue-500',
    badge: 'bg-blue-500/20 text-blue-300',
    card: 'border-blue-500/20 hover:border-blue-400/40',
    dot: 'bg-blue-400',
  },
  Production: {
    header: 'text-purple-400',
    bar: 'bg-purple-500',
    badge: 'bg-purple-500/20 text-purple-300',
    card: 'border-purple-500/20 hover:border-purple-400/40',
    dot: 'bg-purple-400',
  },
  Fixing: {
    header: 'text-green-400',
    bar: 'bg-green-500',
    badge: 'bg-green-500/20 text-green-300',
    card: 'border-green-500/20 hover:border-green-400/40',
    dot: 'bg-green-400',
  },
}

function ProjectPipeline({ role }: { role: string }) {
  const isWideRole = role === 'superadmin' || role === 'manager'
  const { data: projectData, isLoading } = useSWR<{ projects: Project[] }>(
    isWideRole ? '/api/projects?all=true' : '/api/projects',
    fetcher,
    { refreshInterval: 60000 },
  )
  const { data: taskData } = useSWR<{ tasks: Task[] }>(
    '/api/tasks',
    fetcher,
    { refreshInterval: 60000 },
  )

  const allProjects = projectData?.projects ?? []
  const active = allProjects.filter((p) => !['Closed', 'Archived'].includes(p.projectStage))
  const tasks = taskData?.tasks ?? []

  // Index tasks by project record ID
  const tasksByProject = new Map<string, Task[]>()
  for (const t of tasks) {
    const pid = t.project?.[0]
    if (!pid) continue
    if (!tasksByProject.has(pid)) tasksByProject.set(pid, [])
    tasksByProject.get(pid)!.push(t)
  }

  function getCurrentTask(projectId: string): Task | undefined {
    const pts = tasksByProject.get(projectId) ?? []
    return pts.find((t) => t.status === 'In Progress') ?? pts.find((t) => t.status === 'To Do')
  }

  if (isLoading || active.length === 0) return null

  const grouped: Record<string, Project[]> = {}
  for (const s of PIPELINE_STAGES) grouped[s.key] = []
  for (const p of active) {
    if (p.projectStage in grouped) grouped[p.projectStage].push(p)
  }

  return (
    <div className="bg-gray-800/60 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Active Project Pipeline</h2>
        <span className="text-xs text-gray-500">{active.length} active</span>
      </div>

      <div className="overflow-x-auto">
        <div className="flex items-start gap-0 min-w-max pb-1">
          {PIPELINE_STAGES.map((stage, i) => {
            const stageProjects = grouped[stage.key] ?? []
            const s = STAGE_STYLES[stage.key]
            return (
              <div key={stage.key} className="flex items-start">
                {/* Stage column */}
                <div className="w-44 flex-shrink-0">
                  {/* Stage header */}
                  <div className="flex items-center gap-1.5 mb-3">
                    <div className={`h-0.5 w-4 ${s.bar} opacity-50 rounded-full`} />
                    <span className={`text-[11px] font-bold uppercase tracking-widest ${s.header}`}>
                      {stage.label}
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${s.badge}`}>
                      {stageProjects.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="space-y-2">
                    {stageProjects.length === 0 ? (
                      <div className="h-14 border border-dashed border-gray-700 rounded-xl flex items-center justify-center">
                        <span className="text-[10px] text-gray-600 uppercase tracking-wide">empty</span>
                      </div>
                    ) : (
                      stageProjects.map((p) => {
                        const task = getCurrentTask(p.id)
                        const inProgress = task?.status === 'In Progress'
                        return (
                          <div
                            key={p.id}
                            className={`bg-gray-700/40 border rounded-xl p-2.5 transition-colors ${s.card}`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-mono text-gray-500 leading-none mb-0.5">
                                  {p.projectId}
                                </p>
                                <p className="text-xs font-semibold text-white truncate leading-tight">
                                  {p.projectName}
                                </p>
                                <p className="text-[10px] text-gray-400 truncate mt-0.5">
                                  {p.clientName}
                                </p>
                              </div>
                              <div className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${s.dot}`} />
                            </div>
                            {task && (
                              <div className="mt-2 pt-1.5 border-t border-white/5 flex items-center gap-1.5">
                                <div
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    inProgress ? 'bg-blue-400 animate-pulse' : 'bg-gray-600'
                                  }`}
                                />
                                <p className="text-[10px] text-gray-400 truncate leading-tight">
                                  {task.taskName}
                                </p>
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* Arrow connector */}
                {i < PIPELINE_STAGES.length - 1 && (
                  <div className="w-10 flex-shrink-0 flex items-center justify-center pt-5">
                    <svg className="w-10 h-5 text-gray-600" viewBox="0 0 40 20" fill="none">
                      <path
                        d="M2 10 H30 M24 4 L34 10 L24 16"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-gray-700/50 flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          In Progress
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
          To Do
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <span className="w-2 h-0.5 bg-gray-600 rounded" />
          No task visible for your role
        </span>
      </div>
    </div>
  )
}

export default function HomePage() {
  const { role, name } = useSession()
  const router = useRouter()

  const { data, isLoading } = useSWR<HomeData>(
    '/api/home',
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true },
  )

  const announcements = data?.announcements ?? []
  const events = data?.events ?? []

  const dashboardHref = `/dashboard/${
    role === 'superadmin' ? 'superadmin' :
    role === 'manager' ? 'mgr' :
    role === 'sed' ? 'sed' :
    role === 'fabrication' ? 'fab' : 'fix'
  }`

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
      {/* Hero header with live clock */}
      <div className="px-6 pt-10 pb-8 text-center">
        <p className="text-gray-400 text-sm mb-3">
          Welcome back, <span className="text-white font-medium">{name}</span>
          <span className="ml-2 text-gray-500">({ROLE_LABELS[role] ?? role})</span>
        </p>
        <LiveClock />
        <button
          onClick={() => router.push(dashboardHref)}
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-xl transition-colors"
        >
          Go to My Dashboard
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 pb-10 space-y-6">
        {/* Announcements */}
        <div className="bg-gray-800/60 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">
            Announcements
          </h2>
          {isLoading && (
            <div className="flex justify-center py-6">
              <div className="animate-spin w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full" />
            </div>
          )}
          {!isLoading && announcements.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">No announcements at this time.</p>
          )}
          <div className="space-y-3">
            {announcements.map((ann) => (
              <AnnouncementCard key={ann.id} ann={ann} />
            ))}
          </div>
        </div>

        {/* Project pipeline schematic */}
        <ProjectPipeline role={role} />

        {/* Calendars */}
        <div className="grid gap-4 md:grid-cols-2">
          <MiniCalendar type="installation" events={events} />
          <MiniCalendar type="activity" events={events} />
        </div>
      </div>
    </div>
  )
}
