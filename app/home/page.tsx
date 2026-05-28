'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Announcement, Project, Task } from '@/lib/types'
import type { CalendarEvent } from '@/lib/airtable'
import { useSession } from '@/app/dashboard/layout-client'

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
  onDayClick,
}: {
  type: CalendarType
  events: CalendarEvent[]
  onDayClick?: (date: string) => void
}) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [popoverEvent, setPopoverEvent] = useState<{ ev: CalendarEvent; x: number; y: number } | null>(null)

  const title = type === 'installation' ? 'Installation & Delivery Calendar' : 'Project Activity Calendar'
  const filtered = events.filter((e) =>
    type === 'installation'
      ? e.type === 'installation' || e.type === 'delivery' || e.type === 'fabrication'
      : e.type === 'activity',
  )

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const todayStr = new Date().toISOString().slice(0, 10)

  const pointEvents = filtered.filter((e) => e.type !== 'fabrication')
  const fabRanges = filtered.filter((e) => e.type === 'fabrication')

  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`

  const eventsByDate: Record<string, CalendarEvent[]> = {}
  for (const ev of pointEvents) {
    const d = ev.date.slice(0, 10)
    if (d.startsWith(monthPrefix)) {
      if (!eventsByDate[d]) eventsByDate[d] = []
      eventsByDate[d].push(ev)
    }
  }

  function getFabStatus(dateStr: string): { inRange: boolean; isStart: boolean; isEnd: boolean; titles: string[] } {
    const titles: string[] = []
    let inRange = false; let isStart = false; let isEnd = false
    for (const ev of fabRanges) {
      const start = ev.date.slice(0, 10)
      const end = (ev.endDate ?? ev.date).slice(0, 10)
      if (dateStr >= start && dateStr <= end) {
        inRange = true
        if (dateStr === start) isStart = true
        if (dateStr === end) isEnd = true
        titles.push(ev.title)
      }
    }
    return { inRange, isStart, isEnd, titles }
  }

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const prevMonth = () => { setCurrentMonth(new Date(year, month - 1, 1)); setPopoverEvent(null) }
  const nextMonth = () => { setCurrentMonth(new Date(year, month + 1, 1)); setPopoverEvent(null) }

  const monthLabel = currentMonth.toLocaleDateString('en-AE', { month: 'long', year: 'numeric' })

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        <div className="flex items-center gap-1">
          {onDayClick && (
            <button
              onClick={() => onDayClick(todayStr)}
              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-brand-50 text-brand-600 hover:bg-brand-100 border border-brand-200 mr-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add
            </button>
          )}
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
            const fab = getFabStatus(dateStr)
            const hasTooltip = evs.length > 0 || fab.inRange
            return (
              <div
                key={dateStr}
                onClick={() => onDayClick?.(dateStr)}
                className={`relative flex flex-col items-center py-1 rounded-lg group
                  ${onDayClick ? 'cursor-pointer' : 'cursor-default'}
                  ${isToday ? 'bg-brand-500' : fab.inRange ? 'bg-emerald-50' : onDayClick ? 'hover:bg-blue-50' : evs.length > 0 ? 'hover:bg-gray-50' : ''}`}
              >
                <span className={`text-xs font-medium ${isToday ? 'text-white' : fab.inRange ? 'text-emerald-800' : 'text-gray-700'}`}>
                  {day}
                </span>
                {fab.inRange && !isToday && (
                  <div className="flex gap-0.5 mt-0.5 justify-center">
                    {fab.isStart && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                    {fab.isEnd && !fab.isStart && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />}
                    {!fab.isStart && !fab.isEnd && <span className="w-2 h-0.5 bg-emerald-300 rounded-full" />}
                  </div>
                )}
                {evs.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                    {evs.slice(0, 3).map((ev) => (
                      <span
                        key={ev.id}
                        onClick={(e) => { e.stopPropagation(); setPopoverEvent({ ev, x: e.clientX, y: e.clientY }) }}
                        className={`w-2 h-2 rounded-full cursor-pointer hover:scale-125 transition-transform ${
                          ev.type === 'installation' ? 'bg-blue-500' :
                          ev.type === 'delivery' ? 'bg-yellow-400' : 'bg-amber-400'
                        }`}
                      />
                    ))}
                    {evs.length > 3 && (
                      <span className="text-[9px] text-gray-400">+{evs.length - 3}</span>
                    )}
                  </div>
                )}
                {hasTooltip && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-10 hidden group-hover:block w-48 bg-gray-900 text-white text-xs rounded-lg p-2 shadow-lg pointer-events-none">
                    {fab.titles.map((t, i) => (
                      <div key={i} className="truncate text-emerald-300">{t}</div>
                    ))}
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
              <span className="w-2 h-2 rounded-full bg-yellow-400" />Delivery
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <span className="w-4 h-3 rounded bg-emerald-50 border border-emerald-300 inline-block" />Fabrication
            </span>
          </>
        ) : (
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full bg-amber-400" />Activity
          </span>
        )}
      </div>

      {/* Event detail popover */}
      {popoverEvent && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPopoverEvent(null)} />
          <div
            className="fixed z-50 w-64 bg-white rounded-xl shadow-2xl border border-gray-200 p-4"
            style={{
              top: Math.min(popoverEvent.y + 10, window.innerHeight - 240),
              left: Math.min(Math.max(popoverEvent.x - 128, 8), window.innerWidth - 272),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0 flex-1">
                <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-md mb-1.5 ${
                  popoverEvent.ev.type === 'activity' ? 'bg-amber-100 text-amber-700' :
                  popoverEvent.ev.type === 'installation' ? 'bg-blue-100 text-blue-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {popoverEvent.ev.type}
                </span>
                <p className="text-sm font-semibold text-gray-900 leading-snug">{popoverEvent.ev.title}</p>
              </div>
              <button
                onClick={() => setPopoverEvent(null)}
                className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors mt-0.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Details */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-400 w-14 shrink-0">Date</span>
                <span className="text-gray-800 font-medium">
                  {new Date(popoverEvent.ev.date + 'T00:00:00').toLocaleDateString('en-AE', {
                    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
                  })}
                </span>
              </div>
              {popoverEvent.ev.createdBy && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-400 w-14 shrink-0">Set by</span>
                  <span className="text-gray-800 font-medium">{popoverEvent.ev.createdBy}</span>
                </div>
              )}
              {popoverEvent.ev.projectId && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-400 w-14 shrink-0">Project</span>
                  <span className="font-mono text-gray-700">{popoverEvent.ev.projectId}</span>
                </div>
              )}
              {popoverEvent.ev.customTask && (
                <div className="text-xs">
                  <span className="text-gray-400">Task</span>
                  <p className="text-gray-800 mt-0.5 font-medium">{popoverEvent.ev.customTask}</p>
                </div>
              )}
              {popoverEvent.ev.notes && (
                <div className="text-xs pt-1 border-t border-gray-100">
                  <span className="text-gray-400">Notes</span>
                  <p className="text-gray-700 mt-0.5 whitespace-pre-wrap leading-relaxed">{popoverEvent.ev.notes}</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Add Activity Modal ───────────────────────────────────────────────────────

function AddActivityModal({
  date,
  onClose,
  onSuccess,
}: {
  date: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [title, setTitle] = useState('')
  const [selectedDate, setSelectedDate] = useState(date)
  const [notes, setNotes] = useState('')
  const [customTask, setCustomTask] = useState('')
  const [projectId, setProjectId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: projectData } = useSWR<{ projects: Project[] }>('/api/projects', fetcher, { revalidateOnFocus: false })
  const projects = projectData?.projects ?? []

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
        className="relative bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl"
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
            {saving ? 'Saving…' : 'Save Activity'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Add Installation / Delivery Modal ───────────────────────────────────────

type InstallMode = 'task' | 'delivery'

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
  const [mode, setMode] = useState<InstallMode>('task')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [projectTasks, setProjectTasks] = useState<Task[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [itemsDescription, setItemsDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const projects = projectData?.projects ?? []

  async function handleProjectChange(projectRecordId: string) {
    setSelectedProjectId(projectRecordId)
    setSelectedTaskId('')
    setProjectTasks([])
    if (!projectRecordId || mode !== 'task') return
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

  function handleModeChange(m: InstallMode) {
    setMode(m)
    setSelectedProjectId('')
    setSelectedTaskId('')
    setProjectTasks([])
    setItemsDescription('')
    setError(null)
  }

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    try {
      if (mode === 'task') {
        if (!selectedTaskId) { setError('Select a task'); setSaving(false); return }
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
      } else {
        if (!selectedProjectId) { setError('Select a project'); setSaving(false); return }
        if (!itemsDescription.trim()) { setError('Enter items description'); setSaving(false); return }
        const proj = projects.find((p) => p.id === selectedProjectId)
        if (!proj) { setError('Project not found'); setSaving(false); return }
        const res = await fetch('/api/gate-passes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project: [selectedProjectId],
            itemsDescription: itemsDescription.trim(),
            estimatedSupplyDate: date,
          }),
        })
        if (!res.ok) {
          const d = await res.json()
          setError(d.error ?? 'Failed to save')
          return
        }
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

        {/* Mode toggle */}
        <div className="flex rounded-lg border border-gray-200 p-0.5 mb-4">
          <button
            onClick={() => handleModeChange('task')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'task' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Installation Task
          </button>
          <button
            onClick={() => handleModeChange('delivery')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'delivery' ? 'bg-green-500 text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Delivery
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

          {mode === 'task' && selectedProjectId && (
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

          {mode === 'delivery' && selectedProjectId && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Items Description</label>
              <input
                type="text"
                value={itemsDescription}
                onChange={(e) => setItemsDescription(e.target.value)}
                placeholder="e.g. Kitchen cabinets batch 1"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
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
  const [scopeProject, setScopeProject] = useState<Project | null>(null)
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
    const stage = p.fabricationActive ? 'Production' : p.projectStage
    if (stage in grouped) grouped[stage].push(p)
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
                        const fabOverride = p.fabricationActive && stage.key === 'Production' && p.projectStage !== 'Production'
                        return (
                          <div
                            key={p.id}
                            onClick={() => setScopeProject(p)}
                            className={`bg-gray-700/40 border rounded-xl p-2.5 transition-colors cursor-pointer ${s.card}`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1 mb-0.5">
                                  <p className="text-[10px] font-mono text-gray-500 leading-none">
                                    {p.projectId}
                                  </p>
                                  {fabOverride && (
                                    <span className="text-[9px] font-semibold px-1 py-0 rounded bg-amber-500/20 text-amber-400 leading-4">FAB</span>
                                  )}
                                </div>
                                <p className="text-xs font-semibold text-white truncate leading-tight">
                                  {p.projectName}
                                  {p.nickname && (
                                    <span className="ml-1 font-normal text-gray-400">({p.nickname})</span>
                                  )}
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

      {/* Scope popup */}
      {scopeProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setScopeProject(null)}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative bg-gray-800 border border-gray-600 rounded-2xl p-5 max-w-sm w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="text-[10px] font-mono text-gray-500">{scopeProject.projectId}</p>
                <p className="text-sm font-semibold text-white leading-snug">
                  {scopeProject.projectName}
                  {scopeProject.nickname && (
                    <span className="ml-1.5 font-normal text-gray-400">({scopeProject.nickname})</span>
                  )}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{scopeProject.clientName}</p>
              </div>
              <button
                onClick={() => setScopeProject(null)}
                className="shrink-0 text-gray-500 hover:text-gray-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="border-t border-gray-700 pt-3">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Scope</p>
              <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                {scopeProject.projectDescription ?? <span className="text-gray-600 italic">No scope defined.</span>}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function HomePage() {
  const { role, name } = useSession()
  const router = useRouter()
  const [activityDate, setActivityDate] = useState<string | null>(null)
  const [installationDate, setInstallationDate] = useState<string | null>(null)

  const { data, isLoading, mutate } = useSWR<HomeData>(
    '/api/home',
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true },
  )

  const announcements = data?.announcements ?? []
  const events = data?.events ?? []

  const canAddActivity = ['sed', 'superadmin'].includes(role)
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
          <MiniCalendar
            type="installation"
            events={events}
            onDayClick={canAddInstallation ? setInstallationDate : undefined}
          />
          <MiniCalendar
            type="activity"
            events={events}
            onDayClick={canAddActivity ? setActivityDate : undefined}
          />
        </div>
      </div>

      {activityDate && (
        <AddActivityModal
          date={activityDate}
          onClose={() => setActivityDate(null)}
          onSuccess={() => { mutate() }}
        />
      )}

      {installationDate && (
        <AddInstallationModal
          date={installationDate}
          onClose={() => setInstallationDate(null)}
          onSuccess={() => { mutate() }}
        />
      )}
    </div>
  )
}
