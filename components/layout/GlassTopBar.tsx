'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import { Role } from '@/lib/types'

const ROLE_LABELS: Record<Role, string> = {
  installation: 'Installation',
  sed: 'SED',
  fabrication: 'Fabrication',
  manager: 'Manager',
  superadmin: 'Superadmin',
}

const PAGE_TITLES: Record<string, string> = {
  '/home': 'Home',
  '/dashboard/fix': 'My Tasks',
  '/dashboard/sed': 'My Tasks',
  '/dashboard/fab': 'My Tasks',
  '/dashboard/mgr': 'My Tasks',
  '/dashboard/superadmin': 'Overview',
  '/dashboard/pipeline': 'Pipeline',
}

interface SuperadminMetrics {
  staleProjects: number
  overduePayments: number
  pendingApprovals: number
  callClientTasks: { taskId: string; projectRef: string; projectName: string; clientName: string; clientPhone: string }[]
}

interface AppNotification {
  id: number
  recipient_role: string
  title: string
  body: string
  link: string
  read: number
  created_at: string
}

interface NotificationsResponse {
  notifications: AppNotification[]
  unreadCount: number
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function useRelativeTime(date: Date | null): string {
  const [label, setLabel] = useState('')
  useEffect(() => {
    if (!date) { setLabel(''); return }
    function update() {
      const diff = Math.floor((Date.now() - date!.getTime()) / 1000)
      if (diff < 60) setLabel('just now')
      else if (diff < 3600) setLabel(`${Math.floor(diff / 60)}m ago`)
      else setLabel(`${Math.floor(diff / 3600)}h ago`)
    }
    update()
    const id = setInterval(update, 30000)
    return () => clearInterval(id)
  }, [date])
  return label
}

const ROLE_GLOW: Record<Role, string> = {
  installation: 'ring-blue-500/40',
  sed: 'ring-purple-500/40',
  fabrication: 'ring-amber-500/40',
  manager: 'ring-green-500/40',
  superadmin: 'ring-brand-500/40',
}

const ROLE_DOT: Record<Role, string> = {
  installation: 'bg-blue-500',
  sed: 'bg-purple-500',
  fabrication: 'bg-amber-500',
  manager: 'bg-green-500',
  superadmin: 'bg-brand-500',
}

export default function GlassTopBar({ role, name }: { role: Role; name: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [bellOpen, setBellOpen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const bellRef = useRef<HTMLDivElement>(null)
  const relativeTime = useRelativeTime(lastUpdated)

  const pageTitle = PAGE_TITLES[pathname] ?? ROLE_LABELS[role] + ' Dashboard'

  const showPendingBell = role === 'manager' || role === 'superadmin'

  const { data: pendingData } = useSWR<{ count: number }>(
    showPendingBell ? '/api/tasks/pending-approvals' : null,
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true, onSuccess: () => setLastUpdated(new Date()) },
  )

  const { data: metricsData } = useSWR<SuperadminMetrics>(
    role === 'superadmin' ? '/api/superadmin/metrics' : null,
    fetcher,
    { refreshInterval: 60000, revalidateOnFocus: true, onSuccess: () => setLastUpdated(new Date()) },
  )

  const { data: notifData, mutate: mutateNotifs } = useSWR<NotificationsResponse>(
    '/api/notifications',
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true, onSuccess: () => setLastUpdated(new Date()) },
  )

  const pendingCount = pendingData?.count ?? 0
  const staleCount = metricsData?.staleProjects ?? 0
  const overdueCount = metricsData?.overduePayments ?? 0
  const callClientTasks = metricsData?.callClientTasks ?? []
  const appNotifications = notifData?.notifications ?? []
  const appUnread = notifData?.unreadCount ?? 0

  const totalAlerts =
    appUnread +
    pendingCount +
    (role === 'superadmin' ? staleCount + overdueCount + callClientTasks.length : 0)

  async function handleMarkRead(id: number) {
    await fetch(`/api/notifications/${id}`, { method: 'PATCH' })
    mutateNotifs()
  }

  async function handleMarkAllRead() {
    await fetch('/api/notifications', { method: 'PATCH' })
    mutateNotifs()
  }

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true)
    router.refresh()
    setTimeout(() => { setIsRefreshing(false); setLastUpdated(new Date()) }, 1000)
  }, [router])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const initials = name ? name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() : role[0].toUpperCase()

  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-4 md:px-5 border-b border-white/[0.06]"
      style={{ background: 'rgba(18,18,30,0.95)' }}>

      {/* Left — logo (mobile only) + page title */}
      <div className="flex items-center gap-3">
        {/* Mobile: show W logo since sidebar is hidden */}
        <div className={`w-7 h-7 rounded-lg ${ROLE_DOT[role]} flex items-center justify-center shrink-0 md:hidden shadow-md`}>
          <span className="text-white text-xs font-black">W</span>
        </div>
        <span className="text-sm font-semibold text-white/90">{pageTitle}</span>
        <span className="hidden sm:flex items-center gap-1.5 text-xs text-white/30">
          <span className={`w-1.5 h-1.5 rounded-full ${ROLE_DOT[role]}`} />
          {ROLE_LABELS[role]}
        </span>
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-2">
        {/* Refresh */}
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-white/40
            hover:text-white/80 hover:bg-white/[0.06] transition-all disabled:opacity-30"
          title="Refresh"
        >
          <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        {lastUpdated && (
          <span className="hidden md:block text-[11px] text-white/25">{relativeTime}</span>
        )}

        {/* Bell */}
        <div ref={bellRef} className="relative">
          <button
            onClick={() => setBellOpen((o) => !o)}
            className="relative flex items-center justify-center w-8 h-8 rounded-lg text-white/40
              hover:text-white/80 hover:bg-white/[0.06] transition-all"
            title="Notifications"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {totalAlerts > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse-glow">
                {totalAlerts > 9 ? '9+' : totalAlerts}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="absolute right-0 top-10 w-80 rounded-xl shadow-2xl z-50 overflow-hidden border border-white/[0.08]"
              style={{ background: 'rgba(18,18,30,0.98)', backdropFilter: 'blur(20px)' }}>
              <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                <p className="text-xs font-semibold text-white/70 uppercase tracking-wide">Notifications</p>
                {totalAlerts > 0 && (
                  <span className="text-xs bg-white/[0.08] text-white/50 rounded-full px-2 py-0.5 font-medium">
                    {totalAlerts}
                  </span>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto scrollbar-thin">
                {/* Action Required */}
                {role === 'superadmin' && callClientTasks.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 bg-red-500/10 border-b border-red-500/10">
                      <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block animate-pulse-glow" />
                        Action Required
                      </p>
                    </div>
                    {callClientTasks.map((t) => (
                      <div key={t.taskId} className="px-4 py-3 flex items-start gap-3 hover:bg-white/[0.04] transition-colors">
                        <svg className="w-3.5 h-3.5 text-teal-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white/80">Call client — all gates cleared</p>
                          <p className="text-xs text-white/50 truncate">{t.projectName}</p>
                          <p className="text-[10px] text-white/30 font-mono">{t.projectRef} · {t.clientName}</p>
                          {t.clientPhone && (
                            <a href={`tel:${t.clientPhone}`} className="text-[11px] font-semibold text-teal-400 hover:text-teal-300">
                              {t.clientPhone}
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pending Approval */}
                {pendingCount > 0 && (
                  <div>
                    <div className="px-4 py-1.5 bg-orange-500/10 border-b border-orange-500/10">
                      <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />
                        Pending Approval
                      </p>
                    </div>
                    <div className="px-4 py-3 flex items-center gap-3 hover:bg-white/[0.04] transition-colors">
                      <span className="text-sm text-white/60">
                        <strong className="text-white/90">{pendingCount}</strong> task{pendingCount !== 1 ? 's' : ''} awaiting review
                      </span>
                    </div>
                  </div>
                )}

                {/* Attention */}
                {role === 'superadmin' && (staleCount > 0 || overdueCount > 0) && (
                  <div>
                    <div className="px-4 py-1.5 bg-yellow-500/10 border-b border-yellow-500/10">
                      <p className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
                        Attention
                      </p>
                    </div>
                    {staleCount > 0 && (
                      <div className="px-4 py-3 flex items-center gap-3 hover:bg-white/[0.04] transition-colors">
                        <span className="text-sm text-white/60">
                          <strong className="text-white/90">{staleCount}</strong> stale project{staleCount !== 1 ? 's' : ''} — no activity &gt;3 days
                        </span>
                      </div>
                    )}
                    {overdueCount > 0 && (
                      <div className="px-4 py-3 flex items-center gap-3 hover:bg-white/[0.04] transition-colors border-t border-white/[0.04]">
                        <span className="text-sm text-white/60">
                          <strong className="text-white/90">{overdueCount}</strong> overdue payment{overdueCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* In-app notifications */}
                {appNotifications.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 bg-blue-500/10 border-b border-blue-500/10 flex items-center justify-between">
                      <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                        Updates
                      </p>
                      {appUnread > 0 && (
                        <button onClick={handleMarkAllRead} className="text-[10px] text-blue-400 hover:text-blue-300 font-medium">
                          Mark all read
                        </button>
                      )}
                    </div>
                    {appNotifications.slice(0, 10).map((n) => (
                      <Link
                        key={n.id}
                        href={n.link || '#'}
                        onClick={() => { handleMarkRead(n.id); setBellOpen(false) }}
                        className={`block px-4 py-3 hover:bg-white/[0.04] transition-colors border-b border-white/[0.04] last:border-0 ${n.read === 0 ? 'bg-blue-500/5' : ''}`}
                      >
                        <div className="flex items-start gap-2">
                          {n.read === 0 && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0 animate-pulse-glow" />}
                          <div className={`min-w-0 ${n.read === 0 ? '' : 'ml-3.5'}`}>
                            <p className="text-xs font-semibold text-white/80 leading-snug">{n.title}</p>
                            {n.body && <p className="text-[11px] text-white/40 mt-0.5 line-clamp-2 whitespace-pre-wrap">{n.body}</p>}
                            <p className="text-[10px] text-white/25 mt-0.5">
                              {new Date(n.created_at).toLocaleDateString('en-AE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                {totalAlerts === 0 && (
                  <div className="px-4 py-6 text-center">
                    <svg className="w-8 h-8 text-white/10 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-sm text-white/40 font-medium">All clear</p>
                    <p className="text-xs text-white/25 mt-0.5">No active alerts</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-white/[0.08]" />

        {/* User chip */}
        <div className={`flex items-center gap-2 pl-2 pr-3 py-1 rounded-full ring-1 ${ROLE_GLOW[role]} bg-white/[0.04]`}>
          <div className={`w-5 h-5 rounded-full ${ROLE_DOT[role]} flex items-center justify-center`}>
            <span className="text-white text-[10px] font-bold">{initials[0]}</span>
          </div>
          <span className="text-xs text-white/70 hidden sm:block">{name || ROLE_LABELS[role]}</span>
        </div>
      </div>
    </header>
  )
}
