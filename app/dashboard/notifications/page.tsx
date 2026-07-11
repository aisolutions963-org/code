'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'

interface AppNotification {
  id: number
  recipient_role: string
  title: string
  body: string
  link: string
  read: number
  category: string
  created_at: string
}

interface NotificationsResponse {
  notifications: AppNotification[]
  unreadCount: number
}

interface OverduePayment {
  id: string
  projectId: string
  projectName: string
  projectRef?: string
  amount: number
  dueDate: string
  paymentType: string
}

interface StaleProject {
  projectId: string
  projectName: string
  projectRef?: string
  daysStale: number
  currentTask: string | null
}

interface SuperadminMetrics {
  staleProjects: number
  staleProjectsList?: StaleProject[]
  overduePayments: OverduePayment[]
  callClientTasks: { taskId: string; projectRef: string; projectName: string; clientName: string; clientPhone: string }[]
}

async function fetcher(url: string) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status}`)
  return r.json()
}

function parseDate(dateStr: string): Date {
  return new Date(dateStr.replace(' ', 'T') + 'Z')
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - parseDate(dateStr).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return parseDate(dateStr).toLocaleDateString('en-AE', { month: 'short', day: 'numeric' })
}

const CATEGORY_LABELS: Record<string, string> = {
  default: 'General',
  installation: 'Installation',
  fabrication: 'Fabrication',
  payment: 'Payments',
}
function categoryLabel(c: string): string {
  return CATEGORY_LABELS[c] ?? (c ? c.charAt(0).toUpperCase() + c.slice(1) : 'General')
}

function dateBucket(dateStr: string): 'Today' | 'This week' | 'Older' {
  const d = parseDate(dateStr)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (d.getTime() >= startOfToday) return 'Today'
  if (d.getTime() >= startOfToday - 6 * 86400_000) return 'This week'
  return 'Older'
}

export default function NotificationsPage() {
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const { data, mutate, isLoading } = useSWR<NotificationsResponse>(
    '/api/notifications?all=true',
    fetcher,
    { refreshInterval: 300_000 },
  )

  // These endpoints return 403 for roles without access — SWR catches the error and data stays undefined
  const { data: metricsData } = useSWR<SuperadminMetrics>(
    '/api/superadmin/metrics',
    fetcher,
    { refreshInterval: 300_000, shouldRetryOnError: false },
  )

  const all = data?.notifications ?? []
  const unreadCount = data?.unreadCount ?? 0
  const categories = Array.from(new Set(all.map((n) => n.category || 'default')))
  const byRead = filter === 'unread' ? all.filter((n) => n.read === 0) : all
  const shown = typeFilter === 'all' ? byRead : byRead.filter((n) => (n.category || 'default') === typeFilter)
  const groupedShown = (['Today', 'This week', 'Older'] as const)
    .map((bucket) => ({ bucket, items: shown.filter((n) => dateBucket(n.created_at) === bucket) }))
    .filter((g) => g.items.length > 0)

  const staleCount = metricsData?.staleProjects ?? 0
  const staleList = metricsData?.staleProjectsList ?? []
  const overduePayments = metricsData?.overduePayments ?? []
  const overdueCount = overduePayments.length
  const callClientTasks = metricsData?.callClientTasks ?? []

  const hasAlerts = staleCount > 0 || overdueCount > 0 || callClientTasks.length > 0

  async function markRead(id: number) {
    await fetch(`/api/notifications/${id}`, { method: 'PATCH' })
    mutate()
  }

  async function markAllRead() {
    await fetch('/api/notifications', { method: 'PATCH' })
    mutate()
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">{unreadCount} unread</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 transition-colors ${filter === 'all' ? 'bg-gray-100 text-gray-800 font-medium' : 'text-gray-500 hover:text-gray-700 bg-white'}`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-3 py-1.5 border-l border-gray-200 transition-colors ${filter === 'unread' ? 'bg-gray-100 text-gray-800 font-medium' : 'text-gray-500 hover:text-gray-700 bg-white'}`}
            >
              Unread {unreadCount > 0 && `(${unreadCount})`}
            </button>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-blue-600 hover:text-blue-700 transition-colors px-2 py-1.5 font-medium"
            >
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Type filter chips */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {['all', ...categories].map((c) => (
            <button
              key={c}
              onClick={() => setTypeFilter(c)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                typeFilter === c
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-500 border-gray-200 hover:text-gray-700'
              }`}
            >
              {c === 'all' ? 'All types' : categoryLabel(c)}
            </button>
          ))}
        </div>
      )}

      {/* Live alerts section (manager + superadmin) */}
      {hasAlerts && filter === 'all' && typeFilter === 'all' && (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Live Alerts</p>
          </div>

          {/* Call client — action required */}
          {callClientTasks.map((t) => (
            <div key={t.taskId} className="px-4 py-3.5 flex items-start gap-3 border-b border-gray-100 bg-red-50/50 last:border-0">
              <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">Call client — all gates cleared</p>
                <p className="text-xs text-gray-600 mt-0.5">{t.projectName}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{t.projectRef} · {t.clientName}</p>
                {t.clientPhone && (
                  <a href={`tel:${t.clientPhone}`} className="text-xs font-semibold text-teal-600 hover:text-teal-700 mt-1 inline-block">
                    {t.clientPhone}
                  </a>
                )}
              </div>
              <span className="text-[10px] font-semibold text-red-600 bg-red-100 px-1.5 py-0.5 rounded shrink-0">Action</span>
            </div>
          ))}

          {/* Stale projects — per-project, with what they're stuck at */}
          {staleList.length > 0
            ? staleList.map((s) => (
                <Link
                  key={s.projectId}
                  href={`/dashboard/project/${s.projectId}`}
                  className="px-4 py-3.5 flex items-start gap-3 border-b border-gray-100 hover:bg-gray-50 transition-colors last:border-0 block"
                >
                  <div className="w-2 h-2 rounded-full bg-yellow-400 mt-1.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{s.projectName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {s.currentTask ? <>Stuck at <span className="font-medium">{s.currentTask}</span> · </> : null}
                      {s.daysStale} day{s.daysStale !== 1 ? 's' : ''} no activity
                    </p>
                  </div>
                  <span className="text-[10px] font-semibold text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded shrink-0">Attention</span>
                </Link>
              ))
            : staleCount > 0 && (
                <div className="px-4 py-3.5 flex items-start gap-3 border-b border-gray-100 last:border-0">
                  <div className="w-2 h-2 rounded-full bg-yellow-400 mt-1.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      <span className="font-semibold">{staleCount}</span> stale project{staleCount !== 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">No activity for more than 3 days</p>
                  </div>
                  <span className="text-[10px] font-semibold text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded shrink-0">Attention</span>
                </div>
              )}

          {/* Overdue payments */}
          {overduePayments.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/projects/${p.projectId}`}
              className="px-4 py-3.5 flex items-start gap-3 border-b border-gray-100 hover:bg-gray-50 transition-colors last:border-0 block"
            >
              <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{p.projectName}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {p.projectRef ? `${p.projectRef} · ` : ''}{p.paymentType || 'Payment'} · AED {p.amount.toLocaleString()}
                </p>
                <p className="text-[11px] text-red-500 mt-0.5">Due {p.dueDate}</p>
              </div>
              <span className="text-[10px] font-semibold text-red-600 bg-red-100 px-1.5 py-0.5 rounded shrink-0">Overdue</span>
            </Link>
          ))}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
              <div className="h-3 bg-gray-100 rounded w-3/4 mb-2" />
              <div className="h-2.5 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && shown.length === 0 && !hasAlerts && (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center">
          <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <p className="text-sm text-gray-500 font-medium">
            {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          </p>
        </div>
      )}

      {/* Notification list — grouped by date */}
      {!isLoading && shown.length > 0 && (
        <div className="space-y-4">
          {groupedShown.map(({ bucket, items }) => (
            <div key={bucket}>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{bucket}</p>
              <div className="space-y-1.5">
          {items.map((n) => {
            const isInstall = n.category === 'installation'
            const unreadBg = isInstall ? 'bg-orange-50 border-orange-100 hover:bg-orange-100/60' : 'bg-blue-50 border-blue-100 hover:bg-blue-100/60'
            const dotColor = isInstall ? 'bg-orange-400' : 'bg-blue-500'
            return (
              <div
                key={n.id}
                onClick={() => n.read === 0 && markRead(n.id)}
                className={`rounded-xl border transition-all ${n.read === 0 ? 'cursor-pointer' : ''} ${
                  n.read === 0 ? unreadBg : 'bg-white border-gray-200'
                }`}
              >
                <div className="px-4 py-3.5 flex items-start gap-3">
                  {n.read === 0 && (
                    <span className={`w-2 h-2 rounded-full ${dotColor} mt-1.5 shrink-0`} />
                  )}
                  <div className={`min-w-0 flex-1 ${n.read !== 0 ? 'pl-5' : ''}`}>
                    {isInstall && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-orange-500 mb-1">
                        <span className="w-1 h-1 rounded-full bg-orange-400 inline-block" />
                        Installation Team
                      </span>
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <p className={`text-sm leading-snug ${n.read === 0 ? 'font-semibold text-gray-900' : 'font-medium text-gray-600'}`}>
                        {n.title}
                      </p>
                      <span className="text-[11px] text-gray-400 shrink-0 mt-0.5 whitespace-nowrap">{timeAgo(n.created_at)}</span>
                    </div>
                    {n.body && (
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed whitespace-pre-wrap">{n.body}</p>
                    )}
                    <p className="text-[11px] text-gray-300 mt-1.5">
                      {parseDate(n.created_at).toLocaleDateString('en-AE', {
                        weekday: 'short', month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
