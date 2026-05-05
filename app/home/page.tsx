'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Announcement } from '@/lib/types'
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

        {/* Calendars */}
        <div className="grid gap-4 md:grid-cols-2">
          <MiniCalendar type="installation" events={events} />
          <MiniCalendar type="activity" events={events} />
        </div>
      </div>
    </div>
  )
}
