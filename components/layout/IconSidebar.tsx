'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { Role } from '@/lib/types'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
}

interface NavGroup {
  label?: string
  items: NavItem[]
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

function TasksIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  )
}

function FormsIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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

function PipelineIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  )
}

function TimelineIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6h16M4 10h16M4 14h10M4 18h6" />
    </svg>
  )
}

function PhaseGateIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function ActivityIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  )
}

function FolderIcon() {
  return (
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

function WarrantyIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  )
}

function TeamIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
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

function WorkerIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
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

function BellIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
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

function RequestsIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0H4m4-5h8" />
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

function LocationIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function InspectIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  )
}

function ClipboardIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  )
}

function ApprovalIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
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

const NAV_GROUPS: Record<Role, NavGroup[]> = {
  superadmin: [
    {
      items: [
        HOME_ITEM,
        { label: 'Overview', href: '/dashboard/superadmin', icon: <ChartIcon /> },
        { label: 'Forms', href: '/dashboard/forms', icon: <FormsIcon /> },
      ],
    },
    {
      label: 'Projects',
      items: [
        { label: 'Pipeline', href: '/dashboard/pipeline', icon: <PipelineIcon /> },
        { label: 'All Projects', href: '/dashboard/superadmin?view=projects', icon: <FolderIcon /> },
        { label: 'Timeline', href: '/dashboard/superadmin?view=timeline', icon: <TimelineIcon /> },
        { label: 'Phase Gates', href: '/dashboard/superadmin?view=phases', icon: <PhaseGateIcon /> },
        { label: 'Activity', href: '/dashboard/superadmin?view=activity', icon: <ActivityIcon /> },
        { label: 'Client Requests', href: '/dashboard/client-requests', icon: <RequestsIcon /> },
      ],
    },
    {
      label: 'Operations',
      items: [
        { label: 'Materials', href: '/dashboard/superadmin?view=materials', icon: <HammerIcon /> },
      ],
    },
    {
      label: 'Finance',
      items: [
        { label: 'Payments', href: '/dashboard/superadmin?view=payments', icon: <CashIcon /> },
        { label: 'Pay Calendar', href: '/dashboard/superadmin?view=calendar', icon: <CalendarIcon /> },
        { label: 'Warranty', href: '/dashboard/superadmin?view=warranty', icon: <WarrantyIcon /> },
      ],
    },
    {
      label: 'Team',
      items: [
        { label: 'Team Activity', href: '/dashboard/superadmin?view=activity', icon: <TeamIcon /> },
        { label: 'Users', href: '/dashboard/superadmin?view=users', icon: <UsersIcon /> },
        { label: 'Workers', href: '/dashboard/superadmin/workers', icon: <WorkerIcon /> },
        { label: 'Timesheets', href: '/dashboard/superadmin/timesheets', icon: <ClockIcon /> },
      ],
    },
    {
      label: 'Comms',
      items: [
        { label: 'Announcements', href: '/dashboard/superadmin?view=announcements', icon: <BellIcon /> },
      ],
    },
  ],

  manager: [
    {
      items: [
        HOME_ITEM,
        { label: 'My Tasks', href: '/dashboard/mgr', icon: <TasksIcon /> },
        { label: 'Forms', href: '/dashboard/forms', icon: <FormsIcon /> },
      ],
    },
    {
      label: 'Projects',
      items: [
        { label: 'Pipeline', href: '/dashboard/pipeline', icon: <PipelineIcon /> },
        { label: 'All Projects', href: '/dashboard/mgr?view=projects', icon: <FolderIcon /> },
      ],
    },
    {
      label: 'Operations',
      items: [
        { label: 'Materials', href: '/dashboard/mgr?view=materials', icon: <HammerIcon /> },
        { label: 'Deliveries', href: '/dashboard/mgr?view=deliveries', icon: <TruckIcon /> },
        { label: 'Install Teams', href: '/dashboard/mgr?view=installation', icon: <TeamIcon /> },
        { label: 'Client Requests', href: '/dashboard/client-requests', icon: <RequestsIcon /> },
      ],
    },
    {
      label: 'Finance',
      items: [
        { label: 'Payments', href: '/dashboard/mgr?view=payments', icon: <CashIcon /> },
        { label: 'Pay Calendar', href: '/dashboard/mgr?view=calendar', icon: <CalendarIcon /> },
      ],
    },
    {
      label: 'Team',
      items: [
        { label: 'Timesheets', href: '/dashboard/mgr?view=timesheets', icon: <ClockIcon /> },
      ],
    },
  ],

  sed: [
    {
      items: [
        HOME_ITEM,
        { label: 'My Tasks', href: '/dashboard/sed', icon: <TasksIcon /> },
        { label: 'Forms', href: '/dashboard/forms', icon: <FormsIcon /> },
      ],
    },
    {
      label: 'Client Work',
      items: [
        { label: 'Client Approvals', href: '/dashboard/sed?view=approvals', icon: <ApprovalIcon /> },
        { label: 'Site Visits', href: '/dashboard/sed?view=site-visits', icon: <LocationIcon /> },
        { label: 'QC Checks', href: '/dashboard/sed?view=qc', icon: <InspectIcon /> },
        { label: 'Client Requests', href: '/dashboard/client-requests', icon: <RequestsIcon /> },
        { label: 'Materials', href: '/dashboard/sed?view=materials', icon: <HammerIcon /> },
      ],
    },
    {
      label: 'Projects',
      items: [
        { label: 'My Projects', href: '/dashboard/sed?view=projects', icon: <FolderIcon /> },
      ],
    },
  ],

  fabrication: [
    {
      items: [
        HOME_ITEM,
        { label: 'My Tasks', href: '/dashboard/fab', icon: <TasksIcon /> },
        { label: 'Forms', href: '/dashboard/forms', icon: <FormsIcon /> },
      ],
    },
    {
      label: 'Production',
      items: [
        { label: 'Team Tasks', href: '/dashboard/fab?view=team', icon: <TeamIcon /> },
        { label: 'Materials', href: '/dashboard/fab?view=materials', icon: <HammerIcon /> },
        { label: 'Schedule', href: '/dashboard/fab?view=timeline', icon: <CalendarIcon /> },
      ],
    },
  ],

  installation: [
    {
      items: [
        HOME_ITEM,
        { label: 'My Tasks', href: '/dashboard/fix', icon: <TasksIcon /> },
        { label: 'Forms', href: '/dashboard/forms', icon: <FormsIcon /> },
      ],
    },
    {
      label: 'Team',
      items: [
        { label: 'Team Tasks', href: '/dashboard/fix?view=team', icon: <TeamIcon /> },
        { label: 'Deliveries', href: '/dashboard/fix?view=deliveries', icon: <TruckIcon /> },
      ],
    },
    {
      label: 'Site Work',
      items: [
        { label: 'Inspections', href: '/dashboard/fix?view=inspections', icon: <InspectIcon /> },
        { label: 'Install Logs', href: '/dashboard/fix?view=logs', icon: <ClipboardIcon /> },
        { label: 'Materials', href: '/dashboard/fix?view=materials', icon: <HammerIcon /> },
      ],
    },
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

const sidebarFetcher = (url: string) => fetch(url).then((r) => r.json())

export default function IconSidebar({ role, name }: { role: Role; name: string }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [viewAsOpen, setViewAsOpen] = useState(false)

  const { data: materialsData } = useSWR<{ pendingCount: number }>(
    '/api/materials',
    sidebarFetcher,
    { refreshInterval: 120_000 },
  )
  const pendingMaterials = materialsData?.pendingCount ?? 0

  const groups = NAV_GROUPS[role] ?? []
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
      <div className="flex items-center gap-2.5 h-14 px-4 shrink-0 border-b border-white/[0.06]">
        <img
          src="/logo.png"
          alt="WoodWings"
          className="h-8 w-auto shrink-0 object-contain"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
        <div className="min-w-0">
          <p className="text-white text-xs font-semibold leading-none truncate">WoodWings</p>
          <p className={`text-[11px] leading-none mt-0.5 ${ROLE_TEXT[role]}`}>{ROLE_LABELS[role]}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto scrollbar-thin space-y-4">
        {groups.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/20 select-none">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
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
                    {item.href.includes('view=materials') && pendingMaterials > 0 && (
                      <span className="ml-auto shrink-0 min-w-[18px] h-[18px] flex items-center justify-center
                        text-[10px] font-bold bg-amber-500 text-white rounded-full px-1 leading-none">
                        {pendingMaterials}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
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
            <div
              className="absolute bottom-12 left-2 right-2 rounded-xl overflow-hidden border border-white/[0.08] shadow-2xl z-50 py-1"
              style={{ background: 'rgba(20,20,34,0.99)' }}
            >
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
        <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg ring-1 ${ROLE_RING[role]} bg-white/[0.04]`}>
          <div className={`w-6 h-6 rounded-full ${ROLE_ACCENT[role]} flex items-center justify-center shrink-0`}>
            <span className="text-white text-[10px] font-bold">{initials[0]}</span>
          </div>
          <span className="text-[13px] text-white/70 truncate">{name || ROLE_LABELS[role]}</span>
        </div>

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
