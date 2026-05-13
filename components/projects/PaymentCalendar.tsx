'use client'

import { useState, useMemo } from 'react'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface CalendarEvent {
  id: string
  title: string
  date: string
  type: 'payment-due' | 'payment-received' | 'delivery' | 'installation' | 'activity'
  amount?: number
}

const TYPE_CONFIG: Record<
  CalendarEvent['type'],
  { label: string; dot: string; row: string; text: string }
> = {
  'payment-received': { label: 'Received', dot: 'bg-green-500', row: 'bg-green-50 border-green-200 text-green-800', text: 'text-green-700' },
  'payment-due':      { label: 'Due',      dot: 'bg-red-500',   row: 'bg-red-50 border-red-200 text-red-800',     text: 'text-red-600'   },
  'delivery':         { label: 'Delivery', dot: 'bg-blue-500',  row: 'bg-blue-50 border-blue-200 text-blue-800',  text: 'text-blue-700'  },
  'installation':     { label: 'Install',  dot: 'bg-amber-500', row: 'bg-amber-50 border-amber-200 text-amber-800', text: 'text-amber-700' },
  'activity':         { label: 'Task',     dot: 'bg-gray-400',  row: 'bg-gray-50 border-gray-200 text-gray-700',  text: 'text-gray-500'  },
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

function isoToLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export default function PaymentCalendar() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-indexed

  const { data, isLoading, error } = useSWR<{ events: CalendarEvent[] }>(
    '/api/calendar',
    fetcher,
    { refreshInterval: 60000 },
  )

  const events = useMemo(() => {
    if (!data?.events) return []
    return data.events.filter((e) =>
      ['payment-due', 'payment-received', 'delivery'].includes(e.type),
    )
  }, [data])

  // Build a map: day-of-month → events for current month
  const eventMap = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>()
    for (const ev of events) {
      const d = isoToLocal(ev.date)
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate()
        const list = map.get(day) ?? []
        list.push(ev)
        map.set(day, list)
      }
    }
    return map
  }, [events, year, month])

  // Events for the whole month — sorted by date, for the list below
  const monthEvents = useMemo(() => {
    const all: Array<{ day: number; ev: CalendarEvent }> = []
    Array.from(eventMap.entries()).forEach(([day, evs]) => {
      evs.forEach((ev) => all.push({ day, ev }))
    })
    return all.sort((a, b) => a.day - b.day)
  }, [eventMap])

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1) }
    else setMonth((m) => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1) }
    else setMonth((m) => m + 1)
  }

  // Build grid: first day of month (Mon=0..Sun=6), total days in month
  const firstDay = new Date(year, month, 1).getDay() // 0=Sun..6=Sat
  const firstDayMon = (firstDay + 6) % 7              // shift to Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const totalCells = Math.ceil((firstDayMon + daysInMonth) / 7) * 7
  const cells: Array<number | null> = [
    ...Array(firstDayMon).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ...Array(totalCells - firstDayMon - daysInMonth).fill(null),
  ]

  const todayDay = now.getFullYear() === year && now.getMonth() === month ? now.getDate() : null

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
        Failed to load calendar data.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">
          {MONTHS[month]} {year}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}
            className="text-xs text-brand-600 hover:text-brand-800 font-medium px-2"
          >
            Today
          </button>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        {(['payment-received', 'payment-due', 'delivery'] as const).map((t) => (
          <div key={t} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${TYPE_CONFIG[t].dot}`} />
            {TYPE_CONFIG[t].label}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-200">
          {DAYS.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-medium text-gray-400">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const dayEvents = day ? (eventMap.get(day) ?? []) : []
            const isToday = day === todayDay
            return (
              <div
                key={i}
                className={`min-h-[60px] p-1.5 border-r border-b border-gray-100 last:border-r-0 ${
                  !day ? 'bg-gray-50' : ''
                } ${i % 7 === 6 ? 'border-r-0' : ''}`}
              >
                {day && (
                  <>
                    <span className={`text-xs font-medium block mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday ? 'bg-brand-500 text-white' : 'text-gray-700'
                    }`}>
                      {day}
                    </span>
                    <div className="flex flex-wrap gap-0.5">
                      {dayEvents.slice(0, 4).map((ev) => (
                        <span
                          key={ev.id}
                          title={`${TYPE_CONFIG[ev.type]?.label}: ${ev.title}${ev.amount ? ` — AED ${ev.amount.toLocaleString()}` : ''}`}
                          className={`w-2 h-2 rounded-full ${TYPE_CONFIG[ev.type]?.dot ?? 'bg-gray-300'} cursor-default`}
                        />
                      ))}
                      {dayEvents.length > 4 && (
                        <span className="text-[9px] text-gray-400">+{dayEvents.length - 4}</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Event list for the month */}
      {monthEvents.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {MONTHS[month]} Events
          </p>
          {monthEvents.map(({ day, ev }) => {
            const cfg = TYPE_CONFIG[ev.type]
            return (
              <div key={ev.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-xs ${cfg.row}`}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                <span className="font-medium w-12 flex-shrink-0">{MONTHS[month].slice(0, 3)} {day}</span>
                <span className="font-semibold">{cfg.label}</span>
                <span className="flex-1 truncate">{ev.title}</span>
                {ev.amount != null && (
                  <span className={`font-mono font-medium ${cfg.text}`}>
                    AED {ev.amount.toLocaleString()}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-400 text-center py-4">
          No payment or delivery events in {MONTHS[month]}.
        </p>
      )}
    </div>
  )
}
