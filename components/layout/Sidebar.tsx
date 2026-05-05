'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Role } from '@/lib/types'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
}

function HammerIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
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
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2.5.5M13 16l2.5.5M13 16H9m4 0h2m4-10h-4l-3 9H3" />
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

function HomeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

const HOME_ITEM: NavItem = { label: 'Home', href: '/home', icon: <HomeIcon /> }

const NAV_ITEMS: Record<Role, NavItem[]> = {
  installation: [
    HOME_ITEM,
    { label: 'My Tasks', href: '/dashboard/fix', icon: <CheckIcon /> },
    { label: 'Team Tasks', href: '/dashboard/fix?view=team', icon: <ClipboardIcon /> },
    { label: 'Deliveries', href: '/dashboard/fix?view=deliveries', icon: <TruckIcon /> },
    { label: 'Inspections', href: '/dashboard/fix?view=inspections', icon: <ShieldIcon /> },
    { label: 'Install Logs', href: '/dashboard/fix?view=logs', icon: <ClipboardIcon /> },
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
    { label: 'Production Timeline', href: '/dashboard/fab?view=timeline', icon: <ClipboardIcon /> },
  ],
  manager: [
    HOME_ITEM,
    { label: 'My Tasks', href: '/dashboard/mgr', icon: <CheckIcon /> },
    { label: 'Deliveries', href: '/dashboard/mgr?view=deliveries', icon: <TruckIcon /> },
    { label: 'Payments', href: '/dashboard/mgr?view=payments', icon: <CashIcon /> },
    { label: 'Purchase Orders', href: '/dashboard/mgr?view=purchase', icon: <ClipboardIcon /> },
    { label: 'Installation Teams', href: '/dashboard/mgr?view=installation', icon: <HammerIcon /> },
    { label: 'All Projects', href: '/dashboard/mgr?view=projects', icon: <FolderIcon /> },
  ],
  superadmin: [
    HOME_ITEM,
    { label: 'Overview', href: '/dashboard/superadmin', icon: <ViewGridIcon /> },
    { label: 'Phase Gates', href: '/dashboard/superadmin?view=phases', icon: <ShieldIcon /> },
    { label: 'Payment Tracker', href: '/dashboard/superadmin?view=payments', icon: <CashIcon /> },
    { label: 'Warranty', href: '/dashboard/superadmin?view=warranty', icon: <CheckIcon /> },
    { label: 'All Projects', href: '/dashboard/superadmin?view=projects', icon: <FolderIcon /> },
    { label: 'Users', href: '/dashboard/superadmin/users', icon: <ClipboardIcon /> },
    { label: 'System Health', href: '/admin/health', icon: <HammerIcon /> },
  ],
}

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

export default function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname()
  const items = NAV_ITEMS[role] ?? []

  return (
    <aside className="w-60 shrink-0 bg-gray-900 flex flex-col h-full">
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

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
        {items.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href.includes('?') && pathname + '?' + new URLSearchParams(item.href.split('?')[1] ?? '').toString() === item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors
                ${isActive
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t border-gray-700/50">
        <form action="/api/auth/logout" method="POST"
          onSubmit={async (e) => {
            e.preventDefault()
            await fetch('/api/auth/logout', { method: 'POST' })
            window.location.href = '/login'
          }}
        >
          <button
            type="submit"
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </form>
      </div>
    </aside>
  )
}
