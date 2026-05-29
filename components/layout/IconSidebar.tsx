'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Role } from '@/lib/types'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function HomeIcon({ filled }: { filled?: boolean }) {
  return filled ? (
    <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.03 2.59a1.5 1.5 0 011.94 0l7.5 6.363A1.5 1.5 0 0121 10.097V19.5a1.5 1.5 0 01-1.5 1.5h-5.75a.75.75 0 01-.75-.75V14h-2v6.25a.75.75 0 01-.75.75H4.5A1.5 1.5 0 013 19.5v-9.403c0-.44.201-.855.53-1.144l7.5-6.363z" />
    </svg>
  ) : (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

function TasksIcon({ filled }: { filled?: boolean }) {
  return filled ? (
    <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" d="M7.502 6h7.128A3.375 3.375 0 0118 9.375v9.375a3 3 0 003-3V6.108c0-1.505-1.125-2.811-2.664-2.94a48.972 48.972 0 00-.673-.05A3 3 0 0015 1.5h-1.5a3 3 0 00-2.663 1.618c-.225.015-.45.032-.673.05C8.662 3.295 7.554 4.542 7.502 6zM13.5 3A1.5 1.5 0 0012 4.5h4.5A1.5 1.5 0 0015 3h-1.5zM4.875 6H7.5v-.375A3.375 3.375 0 0110.875 2.25h2.25A3.375 3.375 0 0116.5 5.625V6h2.625a.75.75 0 010 1.5H4.875a.75.75 0 010-1.5zM7.5 9.75a.75.75 0 000 1.5h9a.75.75 0 000-1.5h-9zm-.75 3.75a.75.75 0 01.75-.75h9a.75.75 0 010 1.5h-9a.75.75 0 01-.75-.75zm.75 3a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-4.5z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}

function TruckIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2.5.5M13 16l2.5.5M13 16H9m4 0h2m4-10h-4l-3 9H3" />
    </svg>
  )
}

function FolderIcon({ filled }: { filled?: boolean }) {
  return filled ? (
    <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 10.146V6a3 3 0 013-3h5.379a2.25 2.25 0 011.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 013 3v1.146A4.483 4.483 0 0019.5 9h-15a4.483 4.483 0 00-3 1.146z" />
    </svg>
  ) : (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  )
}

function CashIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function HammerIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}

function UsersIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  )
}

function PipelineIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function SignOutIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  )
}

// ─── Nav config ───────────────────────────────────────────────────────────────

const HOME_ITEM: NavItem = { label: 'Home', href: '/home', icon: <HomeIcon /> }

const NAV_ITEMS: Record<Role, NavItem[]> = {
  installation: [
    HOME_ITEM,
    { label: 'My Tasks', href: '/dashboard/fix', icon: <TasksIcon /> },
    { label: 'Team Tasks', href: '/dashboard/fix?view=team', icon: <UsersIcon /> },
    { label: 'Deliveries', href: '/dashboard/fix?view=deliveries', icon: <TruckIcon /> },
    { label: 'Inspections', href: '/dashboard/fix?view=inspections', icon: <ShieldIcon /> },
    { label: 'Install Logs', href: '/dashboard/fix?view=logs', icon: <TasksIcon /> },
    { label: 'Gate Passes', href: '/dashboard/fix?view=gate-passes', icon: <TruckIcon /> },
  ],
  sed: [
    HOME_ITEM,
    { label: 'My Tasks', href: '/dashboard/sed', icon: <TasksIcon /> },
    { label: 'Client Approvals', href: '/dashboard/sed?view=approvals', icon: <ShieldIcon /> },
    { label: 'Site Visits', href: '/dashboard/sed?view=site-visits', icon: <TruckIcon /> },
    { label: 'QC Checks', href: '/dashboard/sed?view=qc', icon: <ShieldIcon /> },
    { label: 'My Projects', href: '/dashboard/sed?view=projects', icon: <FolderIcon /> },
  ],
  fabrication: [
    HOME_ITEM,
    { label: 'My Tasks', href: '/dashboard/fab', icon: <TasksIcon /> },
    { label: 'Team Tasks', href: '/dashboard/fab?view=team', icon: <UsersIcon /> },
    { label: 'Materials', href: '/dashboard/fab?view=materials', icon: <HammerIcon /> },
    { label: 'Production', href: '/dashboard/fab?view=timeline', icon: <CalendarIcon /> },
  ],
  manager: [
    HOME_ITEM,
    { label: 'My Tasks', href: '/dashboard/mgr', icon: <TasksIcon /> },
    { label: 'Pipeline', href: '/dashboard/pipeline', icon: <PipelineIcon /> },
    { label: 'Deliveries', href: '/dashboard/mgr?view=deliveries', icon: <TruckIcon /> },
    { label: 'Payments', href: '/dashboard/mgr?view=payments', icon: <CashIcon /> },
    { label: 'Pay Calendar', href: '/dashboard/mgr?view=calendar', icon: <CalendarIcon /> },
    { label: 'Materials', href: '/dashboard/mgr?view=materials', icon: <HammerIcon /> },
    { label: 'Install Teams', href: '/dashboard/mgr?view=installation', icon: <TruckIcon /> },
    { label: 'All Projects', href: '/dashboard/mgr?view=projects', icon: <FolderIcon /> },
    { label: 'Timesheets', href: '/dashboard/mgr?view=timesheets', icon: <ClockIcon /> },
  ],
  superadmin: [
    HOME_ITEM,
    { label: 'My Tasks', href: '/dashboard/superadmin?view=tasks', icon: <TasksIcon /> },
    { label: 'Overview', href: '/dashboard/superadmin', icon: <ChartIcon /> },
    { label: 'Pipeline', href: '/dashboard/pipeline', icon: <PipelineIcon /> },
    { label: 'Timeline', href: '/dashboard/superadmin?view=timeline', icon: <ChartIcon /> },
    { label: 'Phase Gates', href: '/dashboard/superadmin?view=phases', icon: <ShieldIcon /> },
    { label: 'Activity', href: '/dashboard/superadmin?view=activity', icon: <TasksIcon /> },
    { label: 'Team Activity', href: '/dashboard/superadmin/team-activity', icon: <UsersIcon /> },
    { label: 'Payments', href: '/dashboard/superadmin?view=payments', icon: <CashIcon /> },
    { label: 'Pay Calendar', href: '/dashboard/superadmin?view=calendar', icon: <CalendarIcon /> },
    { label: 'Warranty', href: '/dashboard/superadmin?view=warranty', icon: <ShieldIcon /> },
    { label: 'Announcements', href: '/dashboard/superadmin?view=announcements', icon: <BellIcon /> },
    { label: 'All Projects', href: '/dashboard/superadmin?view=projects', icon: <FolderIcon /> },
    { label: 'Users', href: '/dashboard/superadmin?view=users', icon: <UsersIcon /> },
    { label: 'Timesheets', href: '/dashboard/superadmin/timesheets', icon: <ClockIcon /> },
  ],
}

const VIEW_AS_LINKS = [
  { label: 'Manager', href: '/dashboard/mgr', color: 'text-green-400' },
  { label: 'SED', href: '/dashboard/sed', color: 'text-purple-400' },
  { label: 'Fabrication', href: '/dashboard/fab', color: 'text-amber-400' },
  { label: 'Installation', href: '/dashboard/fix', color: 'text-blue-400' },
]

const ROLE_LABELS: Record<Role, string> = {
  installation: 'Installation',
  sed: 'SED',
  fabrication: 'Fabrication',
  manager: 'Manager',
  superadmin: 'Superadmin',
}

const ROLE_ACCENT: Record<Role, string> = {
  installation: 'bg-blue-500',
  sed: 'bg-purple-500',
  fabrication: 'bg-amber-500',
  manager: 'bg-green-500',
  superadmin: 'bg-brand-500',
}

const ROLE_TEXT: Record<Role, string> = {
  installation: 'text-blue-400',
  sed: 'text-purple-400',
  fabrication: 'text-amber-400',
  manager: 'text-green-400',
  superadmin: 'text-brand-400',
}

const ROLE_RING: Record<Role, string> = {
  installation: 'ring-blue-500/40',
  sed: 'ring-purple-500/40',
  fabrication: 'ring-amber-500/40',
  manager: 'ring-green-500/40',
  superadmin: 'ring-brand-500/40',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function IconSidebar({ role, name }: { role: Role; name: string }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [viewAsOpen, setViewAsOpen] = useState(false)

  const items = NAV_ITEMS[role] ?? []
  const currentHref = pathname + (searchParams.toString() ? '?' + searchParams.toString() : '')

  function isActive(item: NavItem): boolean {
    return item.href === currentHref
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  const initials = name
    ? name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : role[0].toUpperCase()

  return (
    <aside
      className="w-52 shrink-0 flex flex-col h-full z-40 hidden md:flex"
      style={{ background: 'rgba(14,14,24,0.97)', borderRight: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Logo / role header */}
      <div className="flex items-center gap-3 h-14 px-4 shrink-0 border-b border-white/[0.06]">
        <div className={`w-7 h-7 rounded-lg ${ROLE_ACCENT[role]} flex items-center justify-center shrink-0 shadow-md`}>
          <span className="text-white text-xs font-black">W</span>
        </div>
        <div className="min-w-0">
          <p className="text-white text-xs font-semibold leading-none truncate">WoodWings</p>
          <p className={`text-[11px] leading-none mt-0.5 ${ROLE_TEXT[role]}`}>{ROLE_LABELS[role]}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto scrollbar-thin">
        {items.map((item) => {
          const active = isActive(item)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all duration-150 ${
                active
                  ? `bg-white/[0.10] ${ROLE_TEXT[role]} font-medium`
                  : 'text-white/45 hover:text-white/85 hover:bg-white/[0.06]'
              }`}
            >
              {active && (
                <span className={`absolute left-0 inset-y-1.5 w-0.5 rounded-r ${ROLE_ACCENT[role]}`} />
              )}
              <span className={`transition-colors ${active ? ROLE_TEXT[role] : ''}`}>{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* View as — superadmin only */}
      {role === 'superadmin' && (
        <div className="px-3 py-2 border-t border-white/[0.06] relative">
          <button
            onClick={() => setViewAsOpen((o) => !o)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px]
              text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all"
          >
            <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span className="truncate">View as…</span>
          </button>
          {viewAsOpen && (
            <div className="absolute bottom-12 left-2 right-2 rounded-xl overflow-hidden border border-white/[0.08] shadow-2xl z-50 py-1"
              style={{ background: 'rgba(20,20,34,0.99)' }}>
              {VIEW_AS_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setViewAsOpen(false)}
                  className={`flex items-center px-4 py-2.5 text-[13px] hover:bg-white/[0.06] transition-colors ${l.color}`}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* User + sign out */}
      <div className="px-3 py-3 border-t border-white/[0.06] space-y-1">
        {/* User info */}
        <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg ring-1 ${ROLE_RING[role]} bg-white/[0.04]`}>
          <div className={`w-6 h-6 rounded-full ${ROLE_ACCENT[role]} flex items-center justify-center shrink-0`}>
            <span className="text-white text-[10px] font-bold">{initials[0]}</span>
          </div>
          <span className="text-[13px] text-white/70 truncate">{name || ROLE_LABELS[role]}</span>
        </div>

        {/* Sign out */}
        {confirmLogout ? (
          <div className="flex gap-1.5 px-1">
            <button
              onClick={handleLogout}
              className="flex-1 py-1.5 text-[12px] rounded-lg bg-red-500/80 text-white font-semibold hover:bg-red-500 transition-colors"
            >
              Sign Out
            </button>
            <button
              onClick={() => setConfirmLogout(false)}
              className="flex-1 py-1.5 text-[12px] rounded-lg bg-white/[0.06] text-white/50 hover:bg-white/[0.10] transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmLogout(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px]
              text-white/35 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <SignOutIcon />
            Sign Out
          </button>
        )}
      </div>
    </aside>
  )
}
