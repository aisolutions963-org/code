'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Announcement, Project, Task } from '@/lib/types'
import { useSession } from '@/app/dashboard/layout-client'
import UnifiedCalendar, { TabDef } from '@/components/calendar/UnifiedCalendar'
import CommissionCard from '@/components/sed/CommissionCard'
import PipelineColumn from '@/components/pipeline/PipelineColumn'

interface HomeData {
  announcements: Announcement[]
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const ROLE_LABELS: Record<string, string> = {
  installation: 'Installation Team',
  sed: 'SED',
  fabrication: 'Fabrication',
  manager: 'Manager',
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
    timeZone: 'Asia/Dubai',
  })
  const timeStr = time.toLocaleTimeString('en-AE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'Asia/Dubai',
  })

  return (
    <div className="text-center">
      <p className="text-4xl font-bold text-white tabular-nums" suppressHydrationWarning>{timeStr}</p>
      <p className="text-gray-400 mt-1 text-sm" suppressHydrationWarning>{dateStr}</p>
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

function HomeCalendar({
  canAddActivity,
  canAddInstallation,
  onActivityDate,
}: {
  canAddActivity: boolean
  canAddInstallation: boolean
  onActivityDate: (date: string) => void
}) {
  const tabs: TabDef[] = [
    { id: 'all',          label: 'All',                     dot: 'bg-gray-400',  types: null,                                         noAdd: true },
    { id: 'installation', label: 'Installation & Delivery', dot: 'bg-blue-500',  types: ['installation', 'delivery', 'fabrication'],  canAddEvent: canAddInstallation, showInstallAssign: canAddInstallation },
    { id: 'activity',     label: 'Activity',                dot: 'bg-amber-400', types: ['activity'],                                 noAdd: !canAddActivity },
  ]

  return (
    <UnifiedCalendar
      tabs={tabs}
      onDayClick={(date, tabId) => {
        if (tabId === 'activity' && canAddActivity) onActivityDate(date)
      }}
    />
  )
}


// ─── Add Activity Modal ───────────────────────────────────────────────────────

function AddActivityModal({
  date,
  role,
  onClose,
  onSuccess,
}: {
  date: string
  role?: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [title, setTitle] = useState('')
  const [selectedDate, setSelectedDate] = useState(date)
  const [notes, setNotes] = useState('')
  const [customTask, setCustomTask] = useState('')
  const [projectId, setProjectId] = useState('')
  const [eventType, setEventType] = useState<'activity' | 'fabrication'>('activity')
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isManager = role === 'manager'
  const isFactory = eventType === 'fabrication'

  const { data: projectData } = useSWR<{ projects: Project[] }>('/api/projects', fetcher, { revalidateOnFocus: false })
  const projects = projectData?.projects ?? []

  const { data: teamData } = useSWR<{ members: { id: string; name: string }[] }>(
    isManager ? '/api/team/installation' : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  const { data: conflictsData } = useSWR<{ busyMemberIds: string[] }>(
    isManager && isFactory && selectedDate ? `/api/calendar/conflicts?date=${selectedDate}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  const busyMemberIds = new Set(conflictsData?.busyMemberIds ?? [])
  const allTeamMembers = teamData?.members ?? []

  const selectedProject = projects.find((p) => p.id === projectId)
  const assignedTeamIds = selectedProject?.assignedInstallationTeam ?? []
  const assignedTeamNames = isManager && teamData
    ? teamData.members.filter((m) => assignedTeamIds.includes(m.id)).map((m) => m.name)
    : []

  // Pre-populate selected members from project's assigned team when switching to factory + project
  useEffect(() => {
    if (isFactory && selectedProject?.assignedInstallationTeam?.length) {
      setSelectedMemberIds(selectedProject.assignedInstallationTeam)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, eventType])

  // Reset member selection when date changes
  useEffect(() => {
    setSelectedMemberIds([])
  }, [selectedDate])

  function toggleMember(id: string) {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          date: selectedDate,
          notes: notes.trim() || undefined,
          customTask: customTask.trim() || undefined,
          projectId: projectId || undefined,
          eventType,
          teamMemberIds: isFactory ? selectedMemberIds : [],
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d?.error ?? 'Failed to save activity')
        return
      }
      onSuccess()
      onClose()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <form
        className="relative bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="text-sm font-semibold text-gray-900">New Activity</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Event type toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-4 text-xs">
          <button
            type="button"
            onClick={() => setEventType('activity')}
            className={`flex-1 py-2 font-medium transition-colors ${eventType === 'activity' ? 'bg-amber-50 text-amber-700' : 'text-gray-500 hover:text-gray-700'} border-r border-gray-200`}
          >
            Activity
          </button>
          <button
            type="button"
            onClick={() => setEventType('fabrication')}
            className={`flex-1 py-2 font-medium transition-colors ${isFactory ? 'bg-green-50 text-green-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Factory
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
            {error}
          </p>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Client meeting, Site inspection…"
              required
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date *</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              required
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            >
              <option value="">— No project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.projectId ? `${p.projectId} — ` : ''}{p.nickname ?? p.projectName}
                </option>
              ))}
            </select>
          </div>

          {/* Project's assigned installation team — info only */}
          {isManager && isFactory && projectId && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
              <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider mb-1.5">Project Team</p>
              {assignedTeamNames.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {assignedTeamNames.map((n) => (
                    <span key={n} className="text-xs bg-white border border-blue-200 text-blue-700 px-2 py-0.5 rounded-full">{n}</span>
                  ))}
                </div>
              ) : assignedTeamIds.length > 0 ? (
                <p className="text-xs text-blue-400">Loading…</p>
              ) : (
                <p className="text-xs text-gray-400">No installation team assigned yet</p>
              )}
            </div>
          )}

          {/* Factory: team member multi-select */}
          {isManager && isFactory && allTeamMembers.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Assign Team Members
                {selectedMemberIds.length > 0 && (
                  <span className="ml-1.5 text-green-600">({selectedMemberIds.length} selected)</span>
                )}
              </label>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                {allTeamMembers.map((m) => {
                  const isBusy = busyMemberIds.has(m.id)
                  const isChecked = selectedMemberIds.includes(m.id)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={isBusy}
                      onClick={() => toggleMember(m.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors
                        ${isBusy ? 'opacity-40 cursor-not-allowed bg-gray-50' : isChecked ? 'bg-green-50' : 'hover:bg-gray-50'}`}
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors
                        ${isChecked ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                        {isChecked && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <span className={`text-sm ${isBusy ? 'line-through text-gray-400' : isChecked ? 'text-green-700 font-medium' : 'text-gray-700'}`}>
                        {m.name}
                      </span>
                      {isBusy && <span className="ml-auto text-[10px] text-red-400 font-medium">Booked</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          {!isManager && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Custom Task</label>
              <input
                type="text"
                value={customTask}
                onChange={(e) => setCustomTask(e.target.value)}
                placeholder="e.g. Follow up with supplier…"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Add Installation Modal ───────────────────────────────────────────────────

function AddInstallationModal({
  date,
  onClose,
  onSuccess,
}: {
  date: string
  onClose: () => void
  onSuccess: () => void
}) {
  const { data: projectData } = useSWR<{ projects: Project[] }>('/api/projects?all=true', fetcher)
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [projectTasks, setProjectTasks] = useState<Task[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const projects = projectData?.projects ?? []

  async function handleProjectChange(projectRecordId: string) {
    setSelectedProjectId(projectRecordId)
    setSelectedTaskId('')
    setProjectTasks([])
    if (!projectRecordId) return
    setLoadingTasks(true)
    try {
      const res = await fetch(`/api/tasks?projectId=${projectRecordId}&all=true`)
      const data = await res.json()
      const installTasks = (data.tasks as Task[] ?? []).filter(
        (t) =>
          t.department.includes('Installation') &&
          t.status !== 'Locked' &&
          t.status !== 'Completed',
      )
      setProjectTasks(installTasks)
    } finally {
      setLoadingTasks(false)
    }
  }

  async function handleSubmit() {
    if (!selectedTaskId) { setError('Select a task'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/${selectedTaskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { taskStartDate: date } }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Failed to save')
        return
      }
      onSuccess()
      onClose()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Add to Calendar</h3>
            <p className="text-xs text-gray-500 mt-0.5">{date}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
            {error}
          </p>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Project</label>
            <select
              value={selectedProjectId}
              onChange={(e) => handleProjectChange(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Select a project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.projectId} — {p.projectName}
                </option>
              ))}
            </select>
          </div>

          {selectedProjectId && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Installation Task</label>
              {loadingTasks ? (
                <p className="text-xs text-gray-400 py-1">Loading tasks...</p>
              ) : projectTasks.length === 0 ? (
                <p className="text-xs text-gray-400 py-1">No active installation tasks for this project.</p>
              ) : (
                <select
                  value={selectedTaskId}
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Select a task...</option>
                  {projectTasks.map((t) => (
                    <option key={t.id} value={t.id}>{t.taskName}</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Home Pipeline ────────────────────────────────────────────────────────────

const HOME_COLUMNS: { title: string; stages: string[] }[] = [
  { title: 'Preparing',  stages: ['Preparing'] },
  { title: 'Open',       stages: ['Open'] },
  { title: 'Production', stages: ['Production'] },
  { title: 'Done',       stages: ['Closed'] },
  { title: 'Warranty',   stages: ['Closed and active warranty', 'Warranty expired'] },
]

function HomePipeline({ role: _role }: { role: string }) {
  const [search, setSearch] = useState('')
  const { data, isLoading } = useSWR<{ projects: Project[] }>(
    '/api/projects?all=true',
    fetcher,
    { refreshInterval: 300_000 },
  )

  const projects = useMemo(() => {
    const all = data?.projects ?? []
    if (!search.trim()) return all
    const q = search.toLowerCase()
    return all.filter(
      (p) =>
        p.projectName.toLowerCase().includes(q) ||
        p.clientName.toLowerCase().includes(q) ||
        (p.projectId ?? '').toLowerCase().includes(q),
    )
  }, [data, search])

  const columnData = useMemo(() =>
    HOME_COLUMNS.map((col) => ({
      ...col,
      projects: projects.filter((p) => col.stages.includes(p.projectStage)),
    })),
  [projects])

  return (
    <div className="bg-gray-800/60 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.05]">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide shrink-0">Pipeline</h2>
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="w-full pl-9 pr-4 py-2 rounded-xl text-sm text-white/80 placeholder-white/25
              bg-white/[0.05] border border-white/[0.08] focus:outline-none focus:border-white/20
              focus:bg-white/[0.07] transition-all"
          />
        </div>
        <div className="ml-auto">
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          ) : (
            <span className="text-xs text-white/30">{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex gap-4 px-5 py-4" style={{ minWidth: 'max-content' }}>
          {columnData.map((col) => (
            <PipelineColumn key={col.title} title={col.title} projects={col.projects} />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function HomePage() {
  const { role, name } = useSession()
  const router = useRouter()
  const [activityDate, setActivityDate] = useState<string | null>(null)

  const { data, isLoading, mutate } = useSWR<HomeData>(
    '/api/home',
    fetcher,
    { refreshInterval: 300_000 },
  )

  const announcements = data?.announcements ?? []

  const canAddActivity = ['sed', 'superadmin', 'manager'].includes(role)
  const canAddInstallation = ['manager', 'superadmin'].includes(role)

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
        <img
          src="/logo.png"
          alt="WoodWings"
          className="h-14 w-auto mx-auto mb-5 object-contain"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
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

        {/* Commission card — SED only */}
        {role === 'sed' && <CommissionCard />}

        {/* Project pipeline */}
        <HomePipeline role={role} />

        {/* Calendars */}
        <HomeCalendar
          canAddActivity={canAddActivity}
          canAddInstallation={canAddInstallation}
          onActivityDate={setActivityDate}
        />
      </div>

      {activityDate && (
        <AddActivityModal
          date={activityDate}
          role={role}
          onClose={() => setActivityDate(null)}
          onSuccess={() => { mutate() }}
        />
      )}


    </div>
  )
}
