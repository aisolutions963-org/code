'use client'

import { useState, useMemo } from 'react'
import useSWR from 'swr'
import type { CalendarEvent } from '@/lib/airtable'
import { todayUAE } from '@/lib/dateUtils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

type EventType = CalendarEvent['type']

const TYPE_CFG: Record<EventType, { label: string; dot: string; pill: string; border: string }> = {
  activity:           { label: 'Activity',     dot: 'bg-blue-500',    pill: 'bg-blue-50 text-blue-700 border-blue-200',         border: 'border-l-blue-500'    },
  fabrication:        { label: 'Fabrication',  dot: 'bg-green-500',   pill: 'bg-green-50 text-green-700 border-green-200',      border: 'border-l-green-500'   },
  delivery:           { label: 'Delivery',     dot: 'bg-orange-400',  pill: 'bg-orange-50 text-orange-700 border-orange-200',   border: 'border-l-orange-400'  },
  installation:       { label: 'Installation', dot: 'bg-purple-500',  pill: 'bg-purple-50 text-purple-700 border-purple-200',   border: 'border-l-purple-500'  },
  'payment-received': { label: 'Received',     dot: 'bg-red-400',     pill: 'bg-red-50 text-red-600 border-red-200',            border: 'border-l-red-400'     },
  'payment-due':      { label: 'Payment Due',  dot: 'bg-red-600',     pill: 'bg-red-100 text-red-800 border-red-300',           border: 'border-l-red-600'     },
  personal:           { label: 'My Activity',  dot: 'bg-yellow-400',  pill: 'bg-yellow-50 text-yellow-700 border-yellow-200',   border: 'border-l-yellow-400'  },
}

export interface TabDef {
  id: string
  label: string
  dot: string
  types: EventType[] | null   // null = use parent filterTypes (show all)
  creatorFilter?: string
  canAddEvent?: boolean       // show inline add form
  showInstallAssign?: boolean
  noAdd?: boolean             // hide add button even if parent canAddEvent/onDayClick set
  personalMode?: boolean      // personal tab — posts type:personal events
}

interface Props {
  filterTypes?: EventType[]
  tabs?: TabDef[]
  canAddEvent?: boolean
  showInstallAssign?: boolean
  creatorFilter?: string
  onDayClick?: (date: string, tabId: string) => void
  personalMode?: boolean
}

function isoToLocal(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day)
}

// ─── Assign Team Inline ───────────────────────────────────────────────────────
function AssignTeamInline({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const { data } = useSWR<{ members: { id: string; name: string }[] }>('/api/team/installation', fetcher)
  const members = data?.members ?? []
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await fetch(`/api/projects/${projectId}/assign-installation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamMemberIds: selected }),
    })
    setSaving(false)
    onDone()
  }

  return (
    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
      <p className="text-xs font-semibold text-blue-700">Assign Installation Team</p>
      <div className="flex flex-wrap gap-2">
        {members.map(m => (
          <label key={m.id} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selected.includes(m.id)}
              onChange={e => setSelected(s => e.target.checked ? [...s, m.id] : s.filter(x => x !== m.id))}
              className="rounded border-gray-300"
            />
            <span className="text-gray-700">{m.name}</span>
          </label>
        ))}
        {members.length === 0 && <p className="text-xs text-gray-400">No installation team members found.</p>}
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving}
          className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Assign'}
        </button>
        <button onClick={onDone} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
      </div>
    </div>
  )
}

type CalendarEventType = 'activity' | 'installation' | 'fabrication' | 'delivery' | 'personal'
const EVENT_TYPE_OPTS: { value: CalendarEventType; label: string }[] = [
  { value: 'activity',     label: 'Activity'     },
  { value: 'installation', label: 'Installation' },
  { value: 'delivery',     label: 'Delivery'     },
]
const INSTALL_TYPE_OPTS: { value: CalendarEventType; label: string }[] = [
  { value: 'installation', label: 'Installation' },
  { value: 'fabrication',  label: 'Factory'      },
]

interface CalendarProject {
  id: string
  name: string
  quotationNumber?: string
  quotationReference?: string
  assignedTeamIds?: string[]
}

// ─── Inline Add Form ──────────────────────────────────────────────────────────
function AddEventForm({ defaultDate, onDone, mutate, showFactory, personalMode }: {
  defaultDate: string
  onDone: () => void
  mutate: () => void
  showFactory?: boolean
  personalMode?: boolean
}) {
  const [title, setTitle]             = useState('')
  const [date, setDate]               = useState(defaultDate)
  const [notes, setNotes]             = useState('')
  const [projectId, setProject]       = useState('')
  const [eventType, setType]          = useState<CalendarEventType>(
    showFactory ? 'installation' : personalMode ? 'personal' : 'activity'
  )
  const [saving, setSaving]           = useState(false)
  const [selectedMembers, setMembers] = useState<string[]>([])

  const isFactory = eventType === 'fabrication'

  const { data: projData } = useSWR<{ projects: CalendarProject[] }>(
    !personalMode ? '/api/calendar/projects' : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: teamData } = useSWR<{ members: { id: string; name: string }[] }>(
    '/api/team/installation',
    fetcher,
  )
  const projects    = projData?.projects ?? []
  const teamMembers = teamData?.members  ?? []
  const typeOpts    = showFactory ? INSTALL_TYPE_OPTS : EVENT_TYPE_OPTS

  async function save() {
    if (!title.trim() || !date) return
    setSaving(true)

    let finalNotes = notes.trim()
    if (showFactory && selectedMembers.length > 0) {
      const names = teamMembers.filter(m => selectedMembers.includes(m.id)).map(m => m.name)
      const prefix = `Assigned: ${names.join(', ')}`
      finalNotes = finalNotes ? `${prefix}\n${finalNotes}` : prefix
    }

    await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        date,
        notes: finalNotes || undefined,
        projectId: !isFactory && !personalMode ? (projectId || undefined) : undefined,
        eventType,
        teamMemberIds: showFactory && selectedMembers.length > 0 ? selectedMembers : undefined,
      }),
    })
    setSaving(false)
    mutate()
    onDone()
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
      <p className="text-sm font-semibold text-gray-800">
        {personalMode ? 'New Personal Note' : showFactory ? 'Assign Installation Task' : 'New Activity'}
      </p>

      {/* Type selector — hidden for personal and install tabs */}
      {!personalMode && (
        <div className="flex gap-1.5 flex-wrap">
          {typeOpts.map(opt => {
            const dotColor = TYPE_CFG[opt.value as EventType]?.dot ?? 'bg-gray-400'
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { setType(opt.value); setMembers([]) }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  eventType === opt.value
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700 bg-white'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${eventType === opt.value ? 'bg-white opacity-80' : dotColor}`} />
                {opt.label}
              </button>
            )
          })}
        </div>
      )}

      <input
        autoFocus
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        placeholder={personalMode ? 'Note or reminder…' : isFactory ? 'Factory work description…' : showFactory ? 'Project or task description…' : 'Activity title…'}
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (personalMode || !showFactory)) save() }}
      />

      <input type="date"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        value={date}
        onChange={e => setDate(e.target.value)}
      />

      {/* Project picker (not for factory or personal) */}
      {!isFactory && !personalMode && (
        <select
          value={projectId}
          onChange={e => setProject(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">— No project —</option>
          {projects.map(p => {
            const label = [p.quotationNumber, p.quotationReference].filter(Boolean).join(' — ') || p.name
            return <option key={p.id} value={p.id}>{label}</option>
          })}
        </select>
      )}

      {/* Assigned installation team — read-only info when project selected on installation tab */}
      {!isFactory && !personalMode && projectId && (() => {
        const proj = projects.find(p => p.id === projectId)
        const assigned = teamMembers.filter(m => proj?.assignedTeamIds?.includes(m.id))
        if (!assigned.length) return null
        return (
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
            <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider mb-1.5">Assigned Team</p>
            <div className="flex flex-wrap gap-1.5">
              {assigned.map(m => (
                <span key={m.id} className="text-xs bg-white border border-blue-200 text-blue-700 px-2 py-0.5 rounded-full">
                  {m.name}
                </span>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Team member selection (install tab only) */}
      {showFactory && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-600">Assign Team Members</p>
          {teamMembers.length === 0 ? (
            <p className="text-xs text-gray-400">Loading team…</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {teamMembers.map(m => (
                <label key={m.id} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedMembers.includes(m.id)}
                    onChange={e => setMembers(s => e.target.checked ? [...s, m.id] : s.filter(x => x !== m.id))}
                    className="rounded border-gray-300"
                  />
                  <span className="text-gray-700">{m.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <textarea rows={2}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
        placeholder="Notes (optional)…"
        value={notes}
        onChange={e => setNotes(e.target.value)}
      />

      <div className="flex gap-2">
        <button onClick={save} disabled={saving || !title.trim() || !date}
          className="px-4 py-2 text-sm font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onDone} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
      </div>
    </div>
  )
}

// ─── Event Card ───────────────────────────────────────────────────────────────
function EventCard({ ev, showInstallAssign }: { ev: CalendarEvent; showInstallAssign: boolean }) {
  const cfg = TYPE_CFG[ev.type] ?? TYPE_CFG.activity
  const [assigning, setAssigning] = useState(false)
  const dateLabel = isoToLocal(ev.date).toLocaleDateString('en-AE', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className={`bg-white border border-gray-200 border-l-4 ${cfg.border} rounded-xl p-3.5 shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.pill}`}>{cfg.label}</span>
            <span className="text-xs text-gray-400 font-medium">{dateLabel}</span>
            {ev.endDate && ev.endDate !== ev.date && (
              <span className="text-xs text-gray-400">
                → {isoToLocal(ev.endDate).toLocaleDateString('en-AE', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-gray-900 leading-snug">{ev.title}</p>
          {ev.projectName && (
            <p className="text-xs text-gray-500 font-medium">
              {ev.projectName}{ev.itemName ? <span className="text-gray-400"> › {ev.itemName}</span> : null}
            </p>
          )}
          {ev.createdBy && <p className="text-xs text-gray-400">{ev.createdBy}</p>}
          {ev.notes && (
            <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-100 pt-1.5 mt-1">{ev.notes}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {ev.amount != null && (
            <span className="text-sm font-bold text-gray-900 tabular-nums">
              AED {ev.amount.toLocaleString('en-AE')}
            </span>
          )}
          {showInstallAssign && ev.type === 'installation' && ev.projectId && (
            <button
              onClick={() => setAssigning(v => !v)}
              className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
                assigning ? 'bg-blue-600 text-white border-blue-600' : 'text-blue-600 border-blue-200 hover:bg-blue-50'
              }`}
            >
              Assign Team
            </button>
          )}
        </div>
      </div>
      {assigning && ev.projectId && (
        <AssignTeamInline projectId={ev.projectId} onDone={() => setAssigning(false)} />
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function UnifiedCalendar({
  filterTypes,
  tabs,
  canAddEvent,
  showInstallAssign,
  creatorFilter,
  onDayClick,
  personalMode,
}: Props) {
  const now = new Date()
  const todayStr = todayUAE()

  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [activeTabId, setActiveTabId] = useState<string>(tabs?.[0]?.id ?? '__default__')
  const [showAddForm, setShowAddForm] = useState(false)

  const { data, mutate } = useSWR<{ events: CalendarEvent[] }>('/api/calendar', fetcher, {
    refreshInterval: 300_000,
  })

  const activeTab = tabs?.find(t => t.id === activeTabId)
  const effectiveTypes    = activeTab?.types  ?? filterTypes  ?? null
  const effectiveCreator  = activeTab?.creatorFilter ?? creatorFilter ?? null
  const effectiveCanAdd   = activeTab?.canAddEvent ?? canAddEvent ?? false
  const effectiveAssign   = activeTab?.showInstallAssign ?? showInstallAssign ?? false
  const effectivePersonal = activeTab?.personalMode ?? personalMode ?? false
  const noAdd             = activeTab?.noAdd ?? false

  const allEvents = useMemo(() => {
    let evs = data?.events ?? []
    if (effectiveTypes)   evs = evs.filter(e => effectiveTypes!.includes(e.type as EventType))
    if (effectiveCreator) evs = evs.filter(e => e.createdBy === effectiveCreator)
    return evs
  }, [data, effectiveTypes, effectiveCreator])

  const monthEvents = useMemo(() =>
    allEvents
      .filter(e => { const d = isoToLocal(e.date); return d.getFullYear() === year && d.getMonth() === month })
      .sort((a, b) => a.date.localeCompare(b.date)),
    [allEvents, year, month])

  const eventsByDay = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>()
    for (const ev of monthEvents) {
      const day = isoToLocal(ev.date).getDate()
      map.set(day, [...(map.get(day) ?? []), ev])
    }
    return map
  }, [monthEvents])

  const fabRanges = useMemo(() =>
    allEvents.filter(e => e.type === 'fabrication' && e.endDate),
    [allEvents])

  function inFabRange(dateStr: string) {
    return fabRanges.some(e => dateStr >= e.date.slice(0, 10) && dateStr <= (e.endDate ?? e.date).slice(0, 10))
  }

  const upcomingEvents = useMemo(() => {
    const cutoffDate = new Date(now)
    cutoffDate.setDate(cutoffDate.getDate() + 14)
    const cutoff = cutoffDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
    return allEvents
      .filter(e => e.date.slice(0, 10) >= todayStr && e.date.slice(0, 10) <= cutoff)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 20)
  }, [allEvents, todayStr])

  const panelEvents   = selectedDay ? (eventsByDay.get(selectedDay) ?? []) : upcomingEvents
  const panelTitle    = selectedDay ? `${MONTHS[month]} ${selectedDay}` : 'Next 14 days'

  const selectedDateStr = selectedDay != null
    ? `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
    : todayStr

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1)
    setSelectedDay(null); setShowAddForm(false)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1)
    setSelectedDay(null); setShowAddForm(false)
  }

  const firstDay    = new Date(year, month, 1).getDay()
  const firstDayMon = (firstDay + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const totalCells  = Math.ceil((firstDayMon + daysInMonth) / 7) * 7
  const cells: (number | null)[] = [
    ...Array(firstDayMon).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ...Array(totalCells - firstDayMon - daysInMonth).fill(null),
  ]
  const todayDay = now.getFullYear() === year && now.getMonth() === month ? now.getDate() : null
  const visibleTypes = effectiveTypes ?? (Object.keys(TYPE_CFG) as EventType[])

  const showAddBtn = !noAdd && (effectiveCanAdd || !!onDayClick)

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-gray-100 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Left: Add button */}
          <div>
            {showAddBtn && (
              <button
                onClick={() => {
                  if (effectiveCanAdd) { setShowAddForm(v => !v) }
                  else if (onDayClick) { onDayClick(selectedDateStr, activeTabId) }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {effectiveAssign ? 'Assign Task' : effectivePersonal ? '+ Note' : 'Add Activity'}
              </button>
            )}
          </div>
          {/* Right: navigation */}
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-gray-800 min-w-[100px] text-center">
              {MONTHS[month]} {year}
            </span>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelectedDay(null) }}
              className="ml-1 text-xs font-medium text-brand-600 hover:text-brand-800 px-2 py-1 rounded-lg hover:bg-brand-50 transition-colors"
            >
              Today
            </button>
          </div>
        </div>

        {/* Tabs */}
        {tabs && tabs.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => { setActiveTabId(t.id); setSelectedDay(null); setShowAddForm(false) }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTabId === t.id
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${t.dot}`} />
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Inline Add Form ────────────────────────────────────────────────── */}
      {showAddForm && (
        <div className="px-5 py-4 border-b border-gray-100">
          <AddEventForm
            defaultDate={selectedDateStr}
            onDone={() => setShowAddForm(false)}
            mutate={mutate}
            showFactory={effectiveAssign}
            personalMode={effectivePersonal}
          />
        </div>
      )}

      {/* ── Legend ─────────────────────────────────────────────────────────── */}
      <div className="px-5 py-2.5 border-b border-gray-100 flex flex-wrap items-center gap-x-4 gap-y-1">
        {visibleTypes.map(t => {
          const cfg = TYPE_CFG[t]
          if (!cfg) return null
          return (
            <div key={t} className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
              {cfg.label}
            </div>
          )
        })}
        <span className="ml-auto text-xs text-gray-400">
          {monthEvents.length} event{monthEvents.length !== 1 ? 's' : ''} in {MONTHS[month]}
        </span>
      </div>

      {/* ── Main: Grid + Panel ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] divide-y lg:divide-y-0 lg:divide-x divide-gray-100">

        {/* Calendar grid */}
        <div className="p-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="py-2 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                {d}
              </div>
            ))}
          </div>

          {/* Cells */}
          <div className="grid grid-cols-7 border-l border-t border-gray-100 rounded-xl overflow-hidden">
            {cells.map((day, i) => {
              if (!day) {
                return (
                  <div
                    key={`empty-${i}`}
                    className="min-h-[88px] bg-gray-50/70 border-r border-b border-gray-100"
                  />
                )
              }
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const dayEvs   = eventsByDay.get(day) ?? []
              const isToday  = day === todayDay
              const isSel    = day === selectedDay
              const fabBg    = inFabRange(dateStr) && !isToday && !isSel

              return (
                <button
                  key={dateStr}
                  onClick={() => {
                    const next = isSel ? null : day
                    setSelectedDay(next)
                    if (next && effectiveAssign && effectiveCanAdd) setShowAddForm(true)
                    else if (!next) setShowAddForm(false)
                  }}
                  className={`min-h-[88px] p-2 border-r border-b border-gray-100 text-left align-top transition-colors
                    ${isSel  ? 'bg-brand-50 ring-1 ring-inset ring-brand-300' :
                      fabBg  ? 'bg-emerald-50/70 hover:bg-emerald-100/60' :
                               'hover:bg-gray-50/80'}`}
                >
                  <div className="flex flex-col gap-1">
                    <span className={`text-xs font-semibold inline-flex items-center justify-center w-6 h-6 rounded-full leading-none
                      ${isToday ? 'bg-brand-600 text-white' :
                        isSel  ? 'bg-brand-100 text-brand-700' :
                                 'text-gray-700'}`}>
                      {day}
                    </span>
                    {dayEvs.slice(0, 2).map(ev => {
                      const cfg = TYPE_CFG[ev.type] ?? TYPE_CFG.activity
                      return (
                        <span
                          key={ev.id}
                          className={`text-[10px] leading-snug px-1.5 py-0.5 rounded font-medium truncate border ${cfg.pill}`}
                        >
                          {ev.title}
                        </span>
                      )
                    })}
                    {dayEvs.length > 2 && (
                      <span className="text-[10px] text-gray-400 px-1">
                        +{dayEvs.length - 2} more
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Events panel */}
        <div className="flex flex-col min-h-[400px]">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              {panelTitle}
            </p>
            {selectedDay && (
              <button
                onClick={() => setSelectedDay(null)}
                className="text-xs text-brand-600 hover:text-brand-800 font-medium transition-colors"
              >
                ← Upcoming
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {panelEvents.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-9 h-9 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-gray-400">
                  {selectedDay
                    ? `Nothing on ${MONTHS[month]} ${selectedDay}`
                    : 'Nothing in the next 14 days'}
                </p>
              </div>
            ) : (
              panelEvents.map(ev => (
                <EventCard key={ev.id} ev={ev} showInstallAssign={effectiveAssign} />
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
