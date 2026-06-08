'use client'

import { useState, useMemo } from 'react'
import useSWR from 'swr'
import type { CalendarEvent } from '@/lib/airtable'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

function isoToLocal(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day)
}

const TYPE_CONFIG: Record<string, { label: string; dot: string; pill: string; border: string }> = {
  'activity':          { label: 'Activity',   dot: 'bg-amber-400',  pill: 'bg-amber-50 text-amber-700 border-amber-200',  border: 'border-l-amber-400'  },
  'fabrication':       { label: 'Fabrication',dot: 'bg-emerald-500',pill: 'bg-emerald-50 text-emerald-700 border-emerald-200', border: 'border-l-emerald-500'},
  'delivery':          { label: 'Delivery',   dot: 'bg-yellow-400', pill: 'bg-yellow-50 text-yellow-700 border-yellow-200', border: 'border-l-yellow-400' },
  'installation':      { label: 'Install',    dot: 'bg-blue-500',   pill: 'bg-blue-50 text-blue-700 border-blue-200',    border: 'border-l-blue-500'   },
  'payment-received':  { label: 'Received',   dot: 'bg-green-500',  pill: 'bg-green-50 text-green-700 border-green-200',  border: 'border-l-green-500'  },
  'payment-due':       { label: 'Due',        dot: 'bg-red-500',    pill: 'bg-red-50 text-red-700 border-red-200',        border: 'border-l-red-500'    },
}

interface Props {
  filterTypes?: string[]
  creatorFilter?: string
  canAddEvent?: boolean
  showInstallAssign?: boolean
  title?: string
}

interface InstallMember { id: string; name: string }

function AssignTeamInline({ projectId, currentTeam, onDone }: {
  projectId: string
  currentTeam: string[]
  onDone: () => void
}) {
  const { data } = useSWR<{ members: InstallMember[] }>('/api/team/installation', fetcher)
  const members = data?.members ?? []
  const [selected, setSelected] = useState<string[]>(currentTeam)
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
    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
      <p className="text-xs font-semibold text-blue-700">Assign Installation Team</p>
      <div className="flex flex-wrap gap-2">
        {members.map(m => (
          <label key={m.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={selected.includes(m.id)}
              onChange={e => setSelected(s => e.target.checked ? [...s, m.id] : s.filter(x => x !== m.id))}
              className="rounded border-gray-300"
            />
            <span className="text-gray-700">{m.name}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Assign'}
        </button>
        <button onClick={onDone} className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700">
          Cancel
        </button>
      </div>
    </div>
  )
}

function AddEventForm({ onDone, mutate }: { onDone: () => void; mutate: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!title.trim() || !date) return
    setSaving(true)
    await fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), date, notes: notes.trim() || undefined }),
    })
    setSaving(false)
    mutate()
    onDone()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-3">
      <p className="text-sm font-semibold text-gray-900">New Activity</p>
      <input
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        placeholder="Activity title…"
        value={title}
        onChange={e => setTitle(e.target.value)}
      />
      <input
        type="date"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        value={date}
        onChange={e => setDate(e.target.value)}
      />
      <textarea
        rows={2}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
        placeholder="Notes (optional)…"
        value={notes}
        onChange={e => setNotes(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving || !title.trim() || !date}
          className="px-4 py-2 text-sm font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Add Activity'}
        </button>
        <button onClick={onDone} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function SACalendarView({ filterTypes, creatorFilter, canAddEvent, showInstallAssign, title }: Props) {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [assigningEventId, setAssigningEventId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const { data, mutate } = useSWR<{ events: CalendarEvent[] }>('/api/calendar', fetcher, {
    refreshInterval: 300_000,
  })

  const allEvents = useMemo(() => {
    let evs = data?.events ?? []
    if (filterTypes) evs = evs.filter(e => filterTypes.includes(e.type))
    if (creatorFilter) evs = evs.filter(e => e.createdBy === creatorFilter)
    return evs
  }, [data, filterTypes, creatorFilter])

  const monthEvents = useMemo(() => {
    return allEvents
      .filter(e => {
        const d = isoToLocal(e.date)
        return d.getFullYear() === year && d.getMonth() === month
      })
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [allEvents, year, month])

  const eventsByDay = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>()
    for (const ev of monthEvents) {
      const day = isoToLocal(ev.date).getDate()
      const list = map.get(day) ?? []
      list.push(ev)
      map.set(day, list)
    }
    return map
  }, [monthEvents])

  const displayEvents = selectedDay
    ? (eventsByDay.get(selectedDay) ?? [])
    : monthEvents

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1)
    setSelectedDay(null)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1)
    setSelectedDay(null)
  }

  // Grid
  const firstDay = new Date(year, month, 1).getDay()
  const firstDayMon = (firstDay + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const totalCells = Math.ceil((firstDayMon + daysInMonth) / 7) * 7
  const cells: (number | null)[] = [
    ...Array(firstDayMon).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ...Array(totalCells - firstDayMon - daysInMonth).fill(null),
  ]
  const todayDay = now.getFullYear() === year && now.getMonth() === month ? now.getDate() : null
  const visibleTypes = filterTypes ?? Object.keys(TYPE_CONFIG)

  return (
    <div className="space-y-4 p-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{title ?? 'Calendar'}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{monthEvents.length} event{monthEvents.length !== 1 ? 's' : ''} in {MONTHS[month]}</p>
        </div>
        <div className="flex items-center gap-1">
          {canAddEvent && (
            <button
              onClick={() => setShowAddForm(v => !v)}
              className="mr-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Activity
            </button>
          )}
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelectedDay(null) }}
            className="text-xs font-medium text-brand-600 hover:text-brand-800 px-2 py-1 rounded-lg hover:bg-brand-50"
          >
            Today
          </button>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Add event form */}
      {showAddForm && <AddEventForm onDone={() => setShowAddForm(false)} mutate={mutate} />}

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {visibleTypes.map(t => {
          const cfg = TYPE_CONFIG[t]
          if (!cfg) return null
          return (
            <div key={t} className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </div>
          )
        })}
        {selectedDay && (
          <button
            onClick={() => setSelectedDay(null)}
            className="ml-auto text-xs text-brand-600 hover:text-brand-800 font-medium"
          >
            ← Show all {MONTHS[month]}
          </button>
        )}
      </div>

      {/* Month label */}
      <p className="text-sm font-semibold text-gray-700">{MONTHS[month]} {year}</p>

      {/* Calendar grid */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
          {DAYS.map(d => (
            <div key={d} className="py-2.5 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const dayEvs = day ? (eventsByDay.get(day) ?? []) : []
            const isToday = day === todayDay
            const isSelected = day === selectedDay
            const types = [...new Set(dayEvs.map(e => e.type))]
            return (
              <button
                key={i}
                onClick={() => day && setSelectedDay(isSelected ? null : day)}
                disabled={!day}
                className={`min-h-[72px] p-2 border-r border-b border-gray-100 text-left transition-colors
                  ${!day ? 'bg-gray-50/50 cursor-default' : 'hover:bg-blue-50/40 cursor-pointer'}
                  ${isSelected ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : ''}
                  ${i % 7 === 6 ? 'border-r-0' : ''}`}
              >
                {day && (
                  <div className="space-y-1">
                    <span className={`text-xs font-semibold inline-flex items-center justify-center w-6 h-6 rounded-full
                      ${isToday ? 'bg-brand-600 text-white' : isSelected ? 'bg-blue-600 text-white' : 'text-gray-700'}`}>
                      {day}
                    </span>
                    {types.length > 0 && (
                      <div className="flex flex-wrap gap-0.5">
                        {types.slice(0, 4).map((t, idx) => (
                          <span key={idx} className={`w-2 h-2 rounded-full ${TYPE_CONFIG[t]?.dot ?? 'bg-gray-300'}`} />
                        ))}
                        {dayEvs.length > 4 && (
                          <span className="text-[9px] text-gray-400 leading-4">+{dayEvs.length - 4}</span>
                        )}
                      </div>
                    )}
                    {dayEvs.length > 0 && dayEvs.slice(0, 2).map(ev => (
                      <div key={ev.id} className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate font-medium
                        ${TYPE_CONFIG[ev.type]?.pill ?? 'bg-gray-100 text-gray-600'}`}>
                        {ev.title}
                      </div>
                    ))}
                    {dayEvs.length > 2 && (
                      <p className="text-[9px] text-gray-400">+{dayEvs.length - 2} more</p>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Event list */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {selectedDay ? `${MONTHS[month]} ${selectedDay} — Events` : `${MONTHS[month]} — All Events`}
        </p>

        {displayEvents.length === 0 ? (
          <div className="text-center py-10 bg-white border border-gray-100 rounded-xl">
            <svg className="w-8 h-8 text-gray-200 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-gray-400">No events {selectedDay ? `on ${MONTHS[month]} ${selectedDay}` : `in ${MONTHS[month]}`}</p>
          </div>
        ) : (
          displayEvents.map(ev => {
            const cfg = TYPE_CONFIG[ev.type] ?? TYPE_CONFIG['activity']
            const dateLabel = isoToLocal(ev.date).toLocaleDateString('en-AE', { weekday: 'short', month: 'short', day: 'numeric' })
            const isAssigning = assigningEventId === ev.id

            return (
              <div key={ev.id} className={`bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm border-l-4 ${cfg.border}`}>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1.5">

                      {/* Type + Date */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.pill}`}>
                          {cfg.label}
                        </span>
                        <span className="text-xs text-gray-400 font-medium">{dateLabel}</span>
                        {ev.endDate && ev.endDate !== ev.date && (
                          <span className="text-xs text-gray-400">→ {isoToLocal(ev.endDate).toLocaleDateString('en-AE', { month: 'short', day: 'numeric' })}</span>
                        )}
                      </div>

                      {/* Title */}
                      <p className="text-sm font-semibold text-gray-900 leading-snug">{ev.title}</p>

                      {/* Project */}
                      {ev.projectName && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                          </svg>
                          <span className="font-medium text-gray-800">{ev.projectName}</span>
                          {ev.itemName && <span className="text-gray-400">› {ev.itemName}</span>}
                        </div>
                      )}

                      {/* Created by */}
                      {ev.createdBy && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          {ev.createdBy}
                        </div>
                      )}

                      {/* Notes */}
                      {ev.notes && (
                        <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-100 pt-1.5 mt-1.5">
                          {ev.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {/* Amount */}
                      {ev.amount != null && (
                        <span className="text-sm font-bold text-gray-900 tabular-nums">
                          AED {ev.amount.toLocaleString('en-AE', { minimumFractionDigits: 0 })}
                        </span>
                      )}

                      {/* Assign team button — only on installation events */}
                      {showInstallAssign && ev.type === 'installation' && ev.projectId && (
                        <button
                          onClick={() => setAssigningEventId(isAssigning ? null : ev.id)}
                          className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors
                            ${isAssigning
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'text-blue-600 border-blue-200 hover:bg-blue-50'}`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Assign Team
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Assign team panel */}
                  {isAssigning && ev.projectId && (
                    <AssignTeamInline
                      projectId={ev.projectId}
                      currentTeam={[]}
                      onDone={() => setAssigningEventId(null)}
                    />
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
