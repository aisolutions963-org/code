'use client'

import { useState } from 'react'
import useSWR from 'swr'
import type { CalendarEvent } from '@/lib/airtable'
import { Role } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const TYPE_DOT: Record<string, string> = {
  fabrication: 'bg-emerald-500',
  delivery: 'bg-yellow-400',
  installation: 'bg-blue-500',
  activity: 'bg-amber-400',
  'payment-due': 'bg-red-400',
  'payment-received': 'bg-green-400',
}

export default function EnhancedCalendar({ role }: { role: Role }) {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [currentMonth, setCurrentMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  )
  const [addingActivity, setAddingActivity] = useState(false)

  const { data, mutate } = useSWR<{ events: CalendarEvent[] }>('/api/calendar', fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: true,
  })
  const events = data?.events ?? []

  const canSeeFab = true
  const canSeeDeliveries = true
  const canSeeInstallation = true
  const canSeeActivities = true
  const canAddActivity = ['sed', 'manager', 'superadmin'].includes(role)

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // Build a per-date set of event types (role-visible only) for dot indicators
  const eventTypesByDate: Record<string, Set<string>> = {}
  for (const ev of events) {
    const d = ev.date.slice(0, 10)
    if (!['fabrication', 'delivery', 'installation', 'activity'].includes(ev.type)) continue
    if (!eventTypesByDate[d]) eventTypesByDate[d] = new Set()
    eventTypesByDate[d].add(ev.type)
  }

  const dayEvents = events.filter(e => e.date.slice(0, 10) === selectedDate)
  const fabEvents = canSeeFab ? dayEvents.filter(e => e.type === 'fabrication') : []
  const deliveryEvents = canSeeDeliveries ? dayEvents.filter(e => e.type === 'delivery') : []
  const installEvents = canSeeInstallation ? dayEvents.filter(e => e.type === 'installation') : []
  const activityEvents = canSeeActivities ? dayEvents.filter(e => e.type === 'activity') : []

  const sevenDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    return d.toISOString().slice(0, 10)
  })

  const monthLabel = currentMonth.toLocaleDateString('en-AE', { month: 'long', year: 'numeric' })
  const selectedLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-AE', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  return (
    <div className="bg-gray-800/60 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-700/50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Calendar</h2>
        <span className="text-xs text-gray-400">{selectedLabel}</span>
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* ── Left: Mini month + legend + 7-day strip ── */}
        <div className="lg:w-56 shrink-0 p-4 lg:border-r border-b lg:border-b-0 border-gray-700/50 space-y-5">

          {/* Month navigation */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
                className="p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-700/50 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-[11px] font-semibold text-gray-300">{monthLabel}</span>
              <button
                onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
                className="p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-700/50 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 mb-0.5">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <div key={i} className="text-center text-[9px] font-medium text-gray-600 py-0.5">{d}</div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
              {Array(firstDay).fill(null).map((_, i) => <div key={`e-${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                const mPad = String(month + 1).padStart(2, '0')
                const dPad = String(day).padStart(2, '0')
                const dateStr = `${year}-${mPad}-${dPad}`
                const types = eventTypesByDate[dateStr]
                const visibleTypes = types ? Array.from(types) : []
                const isToday = dateStr === todayStr
                const isSelected = dateStr === selectedDate
                const overlap = visibleTypes.length >= 2

                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`relative flex flex-col items-center py-0.5 rounded transition-colors
                      ${isSelected
                        ? 'bg-brand-500'
                        : isToday
                          ? 'ring-1 ring-brand-400/60'
                          : 'hover:bg-gray-700/50'}`}
                  >
                    <span className={`text-[11px] leading-tight font-medium
                      ${isSelected ? 'text-white' : isToday ? 'text-brand-300' : 'text-gray-300'}`}>
                      {day}
                    </span>
                    {visibleTypes.length > 0 && !isSelected && (
                      <div className="flex gap-0.5 justify-center mt-0.5 h-1.5">
                        {visibleTypes.slice(0, 3).map((t, idx) => (
                          <span key={idx} className={`w-1 h-1 rounded-full ${TYPE_DOT[t] ?? 'bg-gray-500'}`} />
                        ))}
                      </div>
                    )}
                    {overlap && !isSelected && (
                      <span
                        className="absolute top-0 right-0 w-1.5 h-1.5 bg-orange-400 rounded-full"
                        title="Multiple event types"
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {canSeeFab && (
              <span className="flex items-center gap-1 text-[10px] text-gray-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />Fab
              </span>
            )}
            {canSeeDeliveries && (
              <span className="flex items-center gap-1 text-[10px] text-gray-500">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />Delivery
              </span>
            )}
            {canSeeInstallation && (
              <span className="flex items-center gap-1 text-[10px] text-gray-500">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />Install
              </span>
            )}
            {canSeeActivities && (
              <span className="flex items-center gap-1 text-[10px] text-gray-500">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />Activity
              </span>
            )}
            <span className="flex items-center gap-1 text-[10px] text-gray-500">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />Overlap
            </span>
          </div>

          {/* Next 7 Days strip */}
          <div>
            <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest mb-2">
              Next 7 Days
            </p>
            <div className="flex gap-1">
              {sevenDays.map(dateStr => {
                const d = new Date(dateStr + 'T00:00:00')
                const dayNum = d.getDate()
                const dayName = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getDay()]
                const types = eventTypesByDate[dateStr]
                const evCount = types ? types.size : 0
                const isSelected = dateStr === selectedDate
                const isToday = dateStr === todayStr

                return (
                  <button
                    key={dateStr}
                    onClick={() => {
                      setSelectedDate(dateStr)
                      // Navigate month if day is in a different month
                      const target = new Date(d.getFullYear(), d.getMonth(), 1)
                      if (target.getFullYear() !== year || target.getMonth() !== month) {
                        setCurrentMonth(target)
                      }
                    }}
                    className={`flex-1 flex flex-col items-center py-1.5 rounded-lg transition-colors
                      ${isSelected
                        ? 'bg-brand-500'
                        : isToday
                          ? 'ring-1 ring-brand-400/60'
                          : 'hover:bg-gray-700/50'}`}
                  >
                    <span className="text-[9px] text-gray-500">{dayName}</span>
                    <span className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                      {dayNum}
                    </span>
                    {evCount > 0 && (
                      <span className={`text-[9px] font-medium leading-none mt-0.5
                        ${isSelected ? 'text-white/70' : 'text-brand-400'}`}>
                        {evCount}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Right: Detail panel ── */}
        <div className="flex-1 p-4 space-y-4">
          {canSeeFab && (
            <EventSection
              colorClass="text-emerald-400"
              dotClass="bg-emerald-500"
              label="Fabrication"
              events={fabEvents}
              emptyText="No fabrication on this day"
            />
          )}

          {canSeeDeliveries && (
            <EventSection
              colorClass="text-yellow-400"
              dotClass="bg-yellow-400"
              label="Deliveries"
              events={deliveryEvents}
              emptyText="No deliveries on this day"
            />
          )}

          {canSeeInstallation && (
            <EventSection
              colorClass="text-blue-400"
              dotClass="bg-blue-500"
              label="Installation"
              events={installEvents}
              emptyText="No installation on this day"
            />
          )}

          {canSeeActivities && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wide">
                    Activities
                  </span>
                  {activityEvents.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/15 text-amber-300">
                      {activityEvents.length}
                    </span>
                  )}
                </div>
                {canAddActivity && !addingActivity && (
                  <button
                    onClick={() => setAddingActivity(true)}
                    className="flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-md bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add
                  </button>
                )}
              </div>

              {activityEvents.length === 0 && !addingActivity && (
                <p className="text-xs text-gray-600 italic">No activities on this day</p>
              )}

              <div className="space-y-1.5">
                {activityEvents.map(ev => (
                  <EventCard key={ev.id} event={ev} />
                ))}
              </div>

              {addingActivity && (
                <AddActivityForm
                  date={selectedDate}
                  onSuccess={() => { setAddingActivity(false); mutate() }}
                  onCancel={() => setAddingActivity(false)}
                />
              )}
            </div>
          )}

          {!canSeeFab && !canSeeDeliveries && !canSeeInstallation && !canSeeActivities && (
            <p className="text-sm text-gray-600 text-center py-8">
              No calendar data available for your role.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function EventSection({
  colorClass,
  dotClass,
  label,
  events,
  emptyText,
}: {
  colorClass: string
  dotClass: string
  label: string
  events: CalendarEvent[]
  emptyText: string
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass} shrink-0`} />
        <span className={`text-[11px] font-semibold ${colorClass} uppercase tracking-wide`}>{label}</span>
        {events.length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-400">
            {events.length}
          </span>
        )}
      </div>
      {events.length === 0 ? (
        <p className="text-xs text-gray-600 italic">{emptyText}</p>
      ) : (
        <div className="space-y-1.5">
          {events.map(ev => <EventCard key={ev.id} event={ev} />)}
        </div>
      )}
    </div>
  )
}

function EventCard({ event }: { event: CalendarEvent }) {
  const [notesOpen, setNotesOpen] = useState(false)
  const hasProject = Boolean(event.projectName ?? event.projectId)
  const hasNotes = Boolean(event.notes)

  const createdAtLabel = event.createdAt
    ? new Date(event.createdAt).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  return (
    <div className="rounded-xl bg-gray-700/40 border border-gray-600/50 overflow-hidden">
      {/* ── Primary info ── */}
      <div className="px-3 pt-2.5 pb-2">
        <p className="text-xs font-semibold text-gray-100 leading-snug">{event.title}</p>

        {/* End-date span */}
        {event.endDate && event.endDate !== event.date && (
          <p className="text-[10px] text-gray-500 mt-0.5">
            Until{' '}
            {new Date(event.endDate + 'T00:00:00').toLocaleDateString('en-AE', { month: 'short', day: 'numeric' })}
          </p>
        )}

        {/* Amount (payments) */}
        {event.amount != null && (
          <p className="text-[11px] font-semibold text-emerald-400 mt-1">
            AED {event.amount.toLocaleString()}
          </p>
        )}
      </div>

      {/* ── Project / Item ── */}
      {hasProject && (
        <div className="px-3 py-1.5 border-t border-gray-600/30 bg-gray-800/25 flex items-start gap-1.5">
          {/* folder icon */}
          <svg className="w-3 h-3 text-gray-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-gray-300 leading-snug truncate">
              {event.projectName ?? event.projectId}
            </p>
            {event.itemName && (
              <p className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1">
                <span className="text-gray-600">└</span>
                <span className="truncate">{event.itemName}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Creator + timestamp ── */}
      {(event.createdBy || createdAtLabel) && (
        <div className="px-3 py-1.5 border-t border-gray-600/30 bg-gray-800/25 flex items-center gap-1.5 text-[10px] text-gray-500">
          {/* user icon */}
          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          {event.createdBy ? (
            <span className="font-medium text-gray-400">{event.createdBy}</span>
          ) : (
            <span>System</span>
          )}
          {createdAtLabel && (
            <>
              <span className="text-gray-700">·</span>
              <span>{createdAtLabel}</span>
            </>
          )}
        </div>
      )}

      {/* ── Notes (expandable) ── */}
      {hasNotes && (
        <>
          <button
            onClick={() => setNotesOpen(x => !x)}
            className="w-full px-3 py-1 border-t border-gray-600/30 bg-gray-800/20 flex items-center justify-between hover:bg-gray-700/20 transition-colors"
          >
            <span className="text-[10px] text-gray-500">{notesOpen ? 'Hide notes' : 'View notes'}</span>
            <svg
              className={`w-2.5 h-2.5 text-gray-600 transition-transform ${notesOpen ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {notesOpen && (
            <div className="px-3 py-2 border-t border-gray-600/30 bg-gray-900/30">
              <p className="text-[10px] text-gray-300 whitespace-pre-wrap leading-relaxed">{event.notes}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function AddActivityForm({
  date,
  onSuccess,
  onCancel,
}: {
  date: string
  onSuccess: () => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), date, notes: notes.trim() || undefined }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d?.error ?? 'Failed to save')
        return
      }
      onSuccess()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 rounded-lg bg-gray-700/40 border border-gray-600/60 p-3 space-y-2"
    >
      {error && (
        <p className="text-[10px] text-red-400 bg-red-900/20 rounded px-2 py-1">{error}</p>
      )}
      <input
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Activity title…"
        required
        autoFocus
        className="w-full text-xs bg-gray-800 border border-gray-600/60 rounded-lg px-2.5 py-1.5 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <input
        type="text"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Notes (optional)…"
        className="w-full text-xs bg-gray-800 border border-gray-600/60 rounded-lg px-2.5 py-1.5 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="text-[10px] px-2.5 py-1 text-gray-400 hover:text-gray-200 border border-gray-600 rounded-md transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="text-[10px] px-3 py-1 bg-brand-500 text-white rounded-md hover:bg-brand-600 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
