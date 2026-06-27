'use client'

import { useSearchParams } from 'next/navigation'
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

// ─── Root ─────────────────────────────────────────────────────────────────────

const VALID_PAGES = new Set<Page>(['overview','phases','activity','payments','calendar','warranty','users','announcements','projects','tasks','materials'])

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
    </div>
  )
}
