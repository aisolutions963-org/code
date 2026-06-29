'use client'

import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { Page } from './components/types'
import OverviewPage from './components/OverviewPage'
import PhasesPage from './components/PhasesPage'
import ActivityPage from './components/ActivityPage'
import PaymentsPage from './components/PaymentsPage'
import CalendarPage from './components/CalendarPage'
import WarrantyPage from './components/WarrantyPage'
import UsersPage from './components/UsersPage'
import AnnouncementsPage from './components/AnnouncementsPage'
import ProjectsPage from './components/ProjectsPage'
import MyTasksPage from './components/TasksPage'
import MaterialsPage from './components/MaterialsPage'
import PayablesPage from './components/PayablesPage'
import ReceivablesPage from './components/ReceivablesPage'
import type { CalendarEvent } from '@/lib/airtable/calendar'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// ─── Root ─────────────────────────────────────────────────────────────────────

const VALID_PAGES = new Set<Page>(['overview','phases','activity','payments','calendar','warranty','users','announcements','projects','tasks','materials','deliveries','payables','receivables'])

function DeliveriesPage() {
  const { data, isLoading } = useSWR<{ events: CalendarEvent[] }>(
    '/api/calendar',
    fetcher,
    { refreshInterval: 300_000 },
  )
  const todayStr = new Date().toISOString().slice(0, 10)
  const upcoming = (data?.events ?? [])
    .filter((ev) => ev.type === 'installation' && ev.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
  const todayEvents = upcoming.filter((ev) => ev.date === todayStr)
  const laterEvents = upcoming.filter((ev) => ev.date > todayStr)

  return (
    <div className="max-w-2xl space-y-2">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Installation Dates</h2>
      {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
      {!isLoading && upcoming.length === 0 && (
        <p className="text-sm text-gray-400">No upcoming installation dates.</p>
      )}
      {todayEvents.length > 0 && (
        <>
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest pt-1">Today</p>
          {todayEvents.map((ev) => (
            <div key={ev.id} className="bg-blue-50 border border-blue-400 rounded-xl px-4 py-3 flex items-start gap-3">
              <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-blue-200 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-800">{ev.title}</p>
                {ev.projectName && <p className="text-xs text-gray-500 mt-0.5">{ev.projectName}</p>}
                {ev.notes && <p className="text-xs text-gray-500 mt-0.5">{ev.notes}</p>}
                {ev.createdBy && <p className="text-[10px] text-gray-400 mt-1">{ev.createdBy}</p>}
              </div>
            </div>
          ))}
        </>
      )}
      {laterEvents.length > 0 && (
        <>
          {todayEvents.length > 0 && <div className="border-t border-gray-100 pt-1" />}
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pt-1">Upcoming</p>
          {laterEvents.map((ev) => (
            <div key={ev.id} className="bg-white border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-800">{ev.title}</p>
                {ev.projectName && <p className="text-xs text-gray-500 mt-0.5">{ev.projectName}</p>}
                {ev.notes && <p className="text-xs text-gray-500 mt-0.5">{ev.notes}</p>}
                <p className="text-[10px] text-gray-400 mt-1">
                  {new Date(ev.date).toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
                  {ev.createdBy && ` · ${ev.createdBy}`}
                </p>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

export default function SuperadminDashboard() {
  const searchParams = useSearchParams()
  const viewParam = searchParams.get('view') as Page | null
  const page: Page = viewParam && VALID_PAGES.has(viewParam) ? viewParam : 'overview'

  return (
    <div className="p-6 min-w-0">
      {page === 'overview' && <OverviewPage />}
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
      {page === 'deliveries' && <DeliveriesPage />}
      {page === 'payables' && <PayablesPage />}
      {page === 'receivables' && <ReceivablesPage />}
    </div>
  )
}
