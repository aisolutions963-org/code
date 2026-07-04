'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { Role } from '@/lib/types'

// ─── Mobile nav items: 4-5 primary destinations per role ─────────────────────

interface MobileNavItem {
  label: string
  href: string
  icon: (active: boolean) => React.ReactNode
}

function HomeSvg({ active }: { active: boolean }) {
  return active ? (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.03 2.59a1.5 1.5 0 011.94 0l7.5 6.363A1.5 1.5 0 0121 10.097V19.5a1.5 1.5 0 01-1.5 1.5h-5.75a.75.75 0 01-.75-.75V14h-2v6.25a.75.75 0 01-.75.75H4.5A1.5 1.5 0 013 19.5v-9.403c0-.44.201-.855.53-1.144l7.5-6.363z" />
    </svg>
  ) : (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

function TasksSvg({ active }: { active: boolean }) {
  return active ? (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" d="M7.502 6h7.128A3.375 3.375 0 0118 9.375v9.375a3 3 0 003-3V6.108c0-1.505-1.125-2.811-2.664-2.94a48.972 48.972 0 00-.673-.05A3 3 0 0015 1.5h-1.5a3 3 0 00-2.663 1.618c-.225.015-.45.032-.673.05C8.662 3.295 7.554 4.542 7.502 6zM13.5 3A1.5 1.5 0 0012 4.5h4.5A1.5 1.5 0 0015 3h-1.5zM4.875 6H7.5v-.375A3.375 3.375 0 0110.875 2.25h2.25A3.375 3.375 0 0116.5 5.625V6h2.625a.75.75 0 010 1.5H4.875a.75.75 0 010-1.5zM7.5 9.75a.75.75 0 000 1.5h9a.75.75 0 000-1.5h-9zm-.75 3.75a.75.75 0 01.75-.75h9a.75.75 0 010 1.5h-9a.75.75 0 01-.75-.75zm.75 3a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-4.5z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}

function TruckSvg({ active }: { active: boolean }) {
  return (
    <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke={active ? 'none' : 'currentColor'} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2.5.5M13 16l2.5.5M13 16H9m4 0h2m4-10h-4l-3 9H3" />
    </svg>
  )
}

function FolderSvg({ active }: { active: boolean }) {
  return active ? (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 10.146V6a3 3 0 013-3h5.379a2.25 2.25 0 011.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 013 3v1.146A4.483 4.483 0 0019.5 9h-15a4.483 4.483 0 00-3 1.146z" />
    </svg>
  ) : (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  )
}

function CalendarSvg({ active }: { active: boolean }) {
  return active ? (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function CashSvg({ active }: { active: boolean }) {
  return (
    <svg className="w-6 h-6" fill={active ? 'currentColor' : 'none'} stroke={active ? 'none' : 'currentColor'} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function FormsSvg({ active }: { active: boolean }) {
  return active ? (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0016.5 9h-1.875a1.875 1.875 0 01-1.875-1.875V5.25A3.75 3.75 0 009 1.5H5.625zM7.5 15a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 017.5 15zm.75-6.75a.75.75 0 000 1.5H12a.75.75 0 000-1.5H8.25z" clipRule="evenodd" />
      <path d="M12.971 1.816A5.23 5.23 0 0114.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 013.434 1.279 9.768 9.768 0 00-6.963-6.963z" />
    </svg>
  ) : (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function MenuSvg() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

// Primary tabs per role (max 4 + "More")
const PRIMARY_NAV: Record<Role, MobileNavItem[]> = {
  installation: [
    { label: 'Home',       href: '/home',                          icon: (a) => <HomeSvg active={a} /> },
    { label: 'Team',       href: '/dashboard/fix?view=team',       icon: (a) => <TasksSvg active={a} /> },
    { label: 'Deliveries', href: '/dashboard/fix?view=deliveries', icon: (a) => <TruckSvg active={a} /> },
    { label: 'Forms',      href: '/dashboard/forms',               icon: (a) => <FormsSvg active={a} /> },
  ],
  sed: [
    { label: 'Home', href: '/home', icon: (a) => <HomeSvg active={a} /> },
    { label: 'My Tasks', href: '/dashboard/sed', icon: (a) => <TasksSvg active={a} /> },
    { label: 'Forms', href: '/dashboard/forms', icon: (a) => <FormsSvg active={a} /> },
    { label: 'Projects', href: '/dashboard/sed?view=projects', icon: (a) => <CalendarSvg active={a} /> },
  ],
  fabrication: [
    { label: 'Home', href: '/home', icon: (a) => <HomeSvg active={a} /> },
    { label: 'My Tasks', href: '/dashboard/fab', icon: (a) => <TasksSvg active={a} /> },
    { label: 'Forms', href: '/dashboard/forms', icon: (a) => <FormsSvg active={a} /> },
    { label: 'Materials', href: '/dashboard/fab?view=materials', icon: (a) => <FolderSvg active={a} /> },
  ],
  manager: [
    { label: 'Home', href: '/home', icon: (a) => <HomeSvg active={a} /> },
    { label: 'My Tasks', href: '/dashboard/mgr', icon: (a) => <TasksSvg active={a} /> },
    { label: 'Forms', href: '/dashboard/forms', icon: (a) => <FormsSvg active={a} /> },
    { label: 'Payments', href: '/dashboard/mgr?view=payments', icon: (a) => <CashSvg active={a} /> },
  ],
  superadmin: [
    { label: 'Home', href: '/home', icon: (a) => <HomeSvg active={a} /> },
    { label: 'My Tasks', href: '/dashboard/superadmin?view=tasks', icon: (a) => <TasksSvg active={a} /> },
    { label: 'Payments', href: '/dashboard/superadmin?view=payments', icon: (a) => <CashSvg active={a} /> },
    { label: 'Projects', href: '/dashboard/superadmin?view=projects', icon: (a) => <FolderSvg active={a} /> },
  ],
}

const ROLE_ACCENT_BG: Record<Role, string> = {
  installation: 'bg-blue-500',
  sed: 'bg-purple-500',
  fabrication: 'bg-amber-500',
  manager: 'bg-green-500',
  superadmin: 'bg-brand-500',
}

const ROLE_ACTIVE_TEXT: Record<Role, string> = {
  installation: 'text-blue-400',
  sed: 'text-purple-400',
  fabrication: 'text-amber-400',
  manager: 'text-green-400',
  superadmin: 'text-brand-400',
}

const ROLE_LABELS: Record<Role, string> = {
  installation: 'Installation',
  sed: 'SED',
  fabrication: 'Fabrication',
  manager: 'Manager',
  superadmin: 'Superadmin',
}

// All nav items (reused from sidebar) — used in the drawer
const ALL_NAV: Record<Role, { label: string; href: string }[]> = {
  installation: [
    { label: 'Home',       href: '/home' },
    { label: 'Forms',      href: '/dashboard/forms' },
    { label: 'Warranty',   href: '/dashboard/fix?view=warranty' },
    { label: 'Team Tasks', href: '/dashboard/fix?view=team' },
    { label: 'Deliveries', href: '/dashboard/fix?view=deliveries' },
    { label: 'Materials',  href: '/dashboard/fix?view=materials' },
  ],
  sed: [
    { label: 'Home', href: '/home' },
    { label: 'My Tasks', href: '/dashboard/sed' },
    { label: 'Forms', href: '/dashboard/forms' },
    { label: 'Client Requests', href: '/dashboard/client-requests' },
    { label: 'Site Visits', href: '/dashboard/sed?view=site-visits' },
    { label: 'Deliveries', href: '/dashboard/sed?view=deliveries' },
    { label: 'My Projects', href: '/dashboard/sed?view=projects' },
  ],
  fabrication: [
    { label: 'Home', href: '/home' },
    { label: 'My Tasks', href: '/dashboard/fab' },
    { label: 'Forms', href: '/dashboard/forms' },
    { label: 'Team Tasks', href: '/dashboard/fab?view=team' },
    { label: 'Materials', href: '/dashboard/fab?view=materials' },
    { label: 'Production Timeline', href: '/dashboard/fab?view=timeline' },
  ],
  manager: [
    { label: 'Home', href: '/home' },
    { label: 'My Tasks', href: '/dashboard/mgr' },
    { label: 'Forms', href: '/dashboard/forms' },
    { label: 'Client Requests', href: '/dashboard/client-requests' },
    { label: 'Pipeline', href: '/dashboard/pipeline' },
    { label: 'Deliveries', href: '/dashboard/mgr?view=deliveries' },
    { label: 'Payments', href: '/dashboard/mgr?view=payments' },
    { label: 'Pay Calendar', href: '/dashboard/mgr?view=calendar' },
    { label: 'Materials', href: '/dashboard/mgr?view=materials' },
    { label: 'Install Teams', href: '/dashboard/mgr?view=installation' },
    { label: 'All Projects', href: '/dashboard/mgr?view=projects' },
  ],
  superadmin: [
    { label: 'Home', href: '/home' },
    { label: 'My Tasks', href: '/dashboard/superadmin?view=tasks' },
    { label: 'Forms', href: '/dashboard/forms' },
    { label: 'Client Requests', href: '/dashboard/client-requests' },
    { label: 'Overview', href: '/dashboard/superadmin' },
    { label: 'Pipeline', href: '/dashboard/pipeline' },
    { label: 'Phase Gates', href: '/dashboard/superadmin?view=phases' },
    { label: 'Activity', href: '/dashboard/superadmin?view=activity' },
    { label: 'Payments', href: '/dashboard/superadmin?view=payments' },
    { label: 'Pay Calendar', href: '/dashboard/superadmin?view=calendar' },
    { label: 'Warranty', href: '/dashboard/superadmin?view=warranty' },
    { label: 'Announcements', href: '/dashboard/superadmin?view=announcements' },
    { label: 'All Projects', href: '/dashboard/superadmin?view=projects' },
    { label: 'Deliveries', href: '/dashboard/superadmin?view=deliveries' },
    { label: 'Users', href: '/dashboard/superadmin?view=users' },
  ],
}

export default function MobileBottomNav({ role, name }: { role: Role; name: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)

  const currentHref = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname

  function navigate(e: React.MouseEvent, href: string) {
    e.preventDefault()
    router.push(href)
  }
  const tabs = PRIMARY_NAV[role] ?? []
  const activeText = ROLE_ACTIVE_TEXT[role]
  const accentBg = ROLE_ACCENT_BG[role]
  const allNav = ALL_NAV[role] ?? []

  // SED only — count pending client-approval + QC tasks for badge on My Tasks
  const { data: sedTasksData } = useSWR<{
    tasks: Array<{ taskName: string; status: string; qcCheckAtSiteDone?: boolean }>
  }>(
    role === 'sed' ? '/api/tasks' : null,
    (url: string) => fetch(url).then((r) => r.json()),
    { refreshInterval: 120_000 },
  )
  const pendingApprovals =
    role === 'sed'
      ? (sedTasksData?.tasks ?? []).filter((t) => {
          const n = t.taskName.toLowerCase()
          const isApproval =
            (n.startsWith('[gate]') || n.includes('take approval from client')) &&
            (t.status === 'To Do' || t.status === 'In Progress')
          const isQc = t.qcCheckAtSiteDone === false && t.status !== 'Completed'
          return isApproval || isQc
        }).length
      : 0

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  const initials = name
    ? name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : role[0].toUpperCase()

  return (
    <>
      {/* Full-screen menu drawer */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-50 md:hidden"
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="fixed bottom-[64px] left-0 right-0 z-50 md:hidden rounded-t-2xl overflow-hidden"
            style={{ background: 'rgba(14,14,26,0.99)', borderTop: '1px solid rgba(255,255,255,0.08)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full ${accentBg} flex items-center justify-center`}>
                  <span className="text-white text-xs font-bold">{initials}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white/90">{name}</p>
                  <p className={`text-xs ${activeText}`}>{ROLE_LABELS[role]}</p>
                </div>
              </div>
              <button onClick={() => setMenuOpen(false)} className="text-white/40 hover:text-white/80 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* All nav links */}
            <div className="px-3 py-3 grid grid-cols-2 gap-1 max-h-[60vh] overflow-y-auto">
              {allNav.map((item) => {
                const active = item.href === currentHref
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={(e) => { setMenuOpen(false); navigate(e, item.href) }}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      active
                        ? `bg-white/[0.10] ${activeText}`
                        : 'text-white/50 hover:text-white/80 hover:bg-white/[0.06]'
                    }`}
                  >
                    {active && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${accentBg}`} />}
                    {item.label}
                  </Link>
                )
              })}
            </div>

            {/* Sign out */}
            <div className="px-4 pb-4 pt-2 border-t border-white/[0.06]">
              {confirmLogout ? (
                <div className="flex gap-2">
                  <button
                    onClick={handleLogout}
                    className="flex-1 py-3 rounded-xl bg-red-500/80 text-white text-sm font-semibold hover:bg-red-500 transition-colors"
                  >
                    Sign Out
                  </button>
                  <button
                    onClick={() => setConfirmLogout(false)}
                    className="flex-1 py-3 rounded-xl bg-white/[0.06] text-white/50 text-sm hover:bg-white/[0.10] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmLogout(true)}
                  className="w-full py-3 rounded-xl text-sm text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                >
                  Sign Out
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Bottom tab bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 md:hidden flex items-stretch border-t border-white/[0.08]"
        style={{
          background: 'rgba(12,12,22,0.98)',
          backdropFilter: 'blur(24px)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          minHeight: 64,
        }}
      >
        {tabs.map((tab) => {
          const active = tab.href === currentHref
          const showApprovalDot = tab.href === '/dashboard/sed' && pendingApprovals > 0
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={(e) => navigate(e, tab.href)}
              className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-all ${
                active ? activeText : 'text-white/35'
              }`}
            >
              <div className="relative">
                {tab.icon(active)}
                {showApprovalDot && (
                  <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 flex items-center justify-center
                    text-[9px] font-bold bg-orange-500 text-white rounded-full px-0.5 leading-none">
                    {pendingApprovals}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
              {active && (
                <span className={`absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-b ${accentBg}`} />
              )}
            </Link>
          )
        })}

        {/* More button */}
        <button
          onClick={() => setMenuOpen(true)}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-all ${
            menuOpen ? activeText : 'text-white/35'
          }`}
        >
          <MenuSvg />
          <span className="text-[10px] font-medium leading-none">More</span>
        </button>
      </nav>
    </>
  )
}
