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

function HomeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}
function TruckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2.5.5M13 16l2.5.5M13 16H9m4 0h2m4-10h-4l-3 9H3" />
    </svg>
  )
}
function ClipboardIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  )
}
function FolderIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  )
}
function CashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
function ShieldIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  )
}
function ViewGridIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  )
}
function CalendarIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}
function HammerIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    </svg>
  )
}
function ChartIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}
function UsersIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  )
}
function BellIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  )
}

// ─── Nav config ───────────────────────────────────────────────────────────────

const HOME_ITEM: NavItem = { label: 'Home', href: '/home', icon: <HomeIcon /> }

const NAV_ITEMS: Record<Role, NavItem[]> = {
  installation: [
    HOME_ITEM,
    { label: 'My Tasks', href: '/dashboard/fix', icon: <CheckIcon /> },
    { label: 'Team Tasks', href: '/dashboard/fix?view=team', icon: <ClipboardIcon /> },
    { label: 'Deliveries', href: '/dashboard/fix?view=deliveries', icon: <TruckIcon /> },
    { label: 'Inspections', href: '/dashboard/fix?view=inspections', icon: <ShieldIcon /> },
    { label: 'Install Logs', href: '/dashboard/fix?view=logs', icon: <ClipboardIcon /> },
    { label: 'Gate Passes', href: '/dashboard/fix?view=gate-passes', icon: <TruckIcon /> },
  ],
  sed: [
    HOME_ITEM,
    { label: 'My Tasks', href: '/dashboard/sed', icon: <CheckIcon /> },
    { label: 'Client Approvals', href: '/dashboard/sed?view=approvals', icon: <ShieldIcon /> },
    { label: 'Site Visits', href: '/dashboard/sed?view=site-visits', icon: <TruckIcon /> },
    { label: 'QC Checks', href: '/dashboard/sed?view=qc', icon: <ClipboardIcon /> },
    { label: 'My Projects', href: '/dashboard/sed?view=projects', icon: <FolderIcon /> },
  ],
  fabrication: [
    HOME_ITEM,
    { label: 'My Tasks', href: '/dashboard/fab', icon: <CheckIcon /> },
    { label: 'Team Tasks', href: '/dashboard/fab?view=team', icon: <ClipboardIcon /> },
    { label: 'Materials', href: '/dashboard/fab?view=materials', icon: <HammerIcon /> },
    { label: 'Production Timeline', href: '/dashboard/fab?view=timeline', icon: <CalendarIcon /> },
  ],
  manager: [
    HOME_ITEM,
    { label: 'My Tasks', href: '/dashboard/mgr', icon: <CheckIcon /> },
    { label: 'Deliveries', href: '/dashboard/mgr?view=deliveries', icon: <TruckIcon /> },
    { label: 'Payments', href: '/dashboard/mgr?view=payments', icon: <CashIcon /> },
    { label: 'Payment Calendar', href: '/dashboard/mgr?view=calendar', icon: <CalendarIcon /> },
    { label: 'Materials', href: '/dashboard/mgr?view=materials', icon: <HammerIcon /> },
    { label: 'Purchase Orders', href: '/dashboard/mgr?view=purchase', icon: <ClipboardIcon /> },
    { label: 'Installation Teams', href: '/dashboard/mgr?view=installation', icon: <TruckIcon /> },
    { label: 'All Projects', href: '/dashboard/mgr?view=projects', icon: <FolderIcon /> },
  ],
  superadmin: [
    HOME_ITEM,
    { label: 'My Tasks', href: '/dashboard/superadmin?view=tasks', icon: <CheckIcon /> },
    { label: 'Overview', href: '/dashboard/superadmin', icon: <ViewGridIcon /> },
    { label: 'Timeline', href: '/dashboard/superadmin?view=timeline', icon: <ChartIcon /> },
    { label: 'Phase Gates', href: '/dashboard/superadmin?view=phases', icon: <ShieldIcon /> },
    { label: 'Team Activity', href: '/dashboard/superadmin?view=activity', icon: <ClipboardIcon /> },
    { label: 'Payments', href: '/dashboard/superadmin?view=payments', icon: <CashIcon /> },
    { label: 'Pay Calendar', href: '/dashboard/superadmin?view=calendar', icon: <CalendarIcon /> },
    { label: 'Warranty', href: '/dashboard/superadmin?view=warranty', icon: <CheckIcon /> },
    { label: 'Announcements', href: '/dashboard/superadmin?view=announcements', icon: <BellIcon /> },
    { label: 'All Projects', href: '/dashboard/superadmin?view=projects', icon: <FolderIcon /> },
    { label: 'Users', href: '/dashboard/superadmin?view=users', icon: <UsersIcon /> },
    { label: 'System Health', href: '/admin/health', icon: <HammerIcon /> },
  ],
}

const VIEW_AS_LINKS = [
  { label: 'Manager', href: '/dashboard/mgr' },
  { label: 'SED', href: '/dashboard/sed' },
  { label: 'Fabrication', href: '/dashboard/fab' },
  { label: 'Installation', href: '/dashboard/fix' },
]

const ROLE_LABELS: Record<Role, string> = {
  installation: 'Installation',
  sed: 'SED',
  fabrication: 'Fabrication',
  manager: 'Manager',
  superadmin: 'Superadmin',
}

const ROLE_COLORS: Record<Role, string> = {
  installation: 'bg-blue-500',
  sed: 'bg-purple-500',
  fabrication: 'bg-amber-500',
  manager: 'bg-green-500',
  superadmin: 'bg-brand-500',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [confirmLogout, setConfirmLogout] = useState(false)
  const items = NAV_ITEMS[role] ?? []

  const currentHref = pathname + (searchParams.toString() ? '?' + searchParams.toString() : '')

  function isActive(item: NavItem): boolean {
    return item.href === currentHref
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <aside className="w-56 shrink-0 bg-gray-900 flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-gray-700/50">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg ${ROLE_COLORS[role]} flex items-center justify-center shrink-0`}>
            <span className="text-white text-xs font-bold">{ROLE_LABELS[role][0]}</span>
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold truncate">
              {process.env.NEXT_PUBLIC_APP_NAME ?? 'WoodWings'}
            </p>
            <p className="text-gray-400 text-xs">{ROLE_LABELS[role]}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
        {items.map((item) => {
          const active = isActive(item)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all
                ${active
                  ? 'bg-gray-700/80 text-white font-medium'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
            >
              {active && (
                <span className="absolute left-0 inset-y-1.5 w-0.5 bg-brand-400 rounded-r" />
              )}
              <span className={`shrink-0 transition-colors ${active ? 'text-brand-400' : ''}`}>
                {item.icon}
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* View as — superadmin only */}
      {role === 'superadmin' && (
        <div className="px-4 py-3 border-t border-gray-700/50">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">View as</p>
          <div className="flex flex-wrap gap-1.5">
            {VIEW_AS_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-[11px] text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Sign out */}
      <div className="px-3 py-4 border-t border-gray-700/50">
        {confirmLogout ? (
          <div className="px-1 space-y-2">
            <p className="text-xs text-gray-400 px-2">Sign out of WoodWings?</p>
            <div className="flex gap-2">
              <button
                onClick={handleLogout}
                className="flex-1 py-1.5 text-xs rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
              >
                Sign Out
              </button>
              <button
                onClick={() => setConfirmLogout(false)}
                className="flex-1 py-1.5 text-xs rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmLogout(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        )}
      </div>
    </aside>
  )
}
