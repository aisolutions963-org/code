'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Role } from '@/lib/types'

const ROLE_LABELS: Record<Role, string> = {
  installation: 'Installation Team',
  sed: 'SED',
  fabrication: 'Fabrication',
  manager: 'Manager',
  superadmin: 'Superadmin',
}

interface SuperadminMetrics {
  staleProjects: number
  overduePayments: number
  pendingApprovals: number
  callClientTasks: { taskId: string; projectRef: string; projectName: string; clientName: string; clientPhone: string }[]
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

export default function TopBar({ role, name }: { role: Role; name: string }) {
  const router = useRouter()
  const [bellOpen, setBellOpen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const bellRef = useRef<HTMLDivElement>(null)
  const relativeTime = useRelativeTime(lastUpdated)

  const showPendingBell = role === 'manager' || role === 'superadmin'

  const { data: pendingData } = useSWR<{ count: number }>(
    showPendingBell ? '/api/tasks/pending-approvals' : null,
    fetcher,
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
      onSuccess: () => setLastUpdated(new Date()),
    },
  )

  const { data: metricsData } = useSWR<SuperadminMetrics>(
    role === 'superadmin' ? '/api/superadmin/metrics' : null,
    fetcher,
    {
      refreshInterval: 60000,
      revalidateOnFocus: true,
      onSuccess: () => setLastUpdated(new Date()),
    },
  )

  const pendingCount = pendingData?.count ?? 0
  const staleCount = metricsData?.staleProjects ?? 0
  const overdueCount = metricsData?.overduePayments ?? 0
  const callClientTasks = metricsData?.callClientTasks ?? []
  const totalAlerts =
    pendingCount + (role === 'superadmin' ? staleCount + overdueCount + callClientTasks.length : 0)

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true)
    router.refresh()
    setTimeout(() => {
      setIsRefreshing(false)
      setLastUpdated(new Date())
    }, 1000)
  }, [router])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-900">
          {ROLE_LABELS[role]} Dashboard
        </span>
      </div>

      <div className="flex items-center gap-3">
        {showPendingBell && (
          <div ref={bellRef} className="relative">
            <button
              onClick={() => setBellOpen((o) => !o)}
              title="Notifications"
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors relative"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {totalAlerts > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {totalAlerts > 9 ? '9+' : totalAlerts}
                </span>
              )}
            </button>

            {bellOpen && (
              <div className="absolute right-0 top-8 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Notifications</p>
                  {totalAlerts > 0 && (
                    <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 font-medium">
                      {totalAlerts}
                    </span>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto">
                  {/* Action Required */}
                  {role === 'superadmin' && callClientTasks.length > 0 && (
                    <div>
                      <div className="px-4 py-1.5 bg-red-50 border-b border-red-100">
                        <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                          Action Required
                        </p>
                      </div>
                      {callClientTasks.map((t) => (
                        <div key={t.taskId} className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors">
                          <svg className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-800">Call client — all gates cleared</p>
                            <p className="text-xs text-gray-600 truncate">{t.projectName}</p>
                            <p className="text-[10px] text-gray-400 font-mono">{t.projectRef} · {t.clientName}</p>
                            {t.clientPhone && (
                              <a
                                href={`tel:${t.clientPhone}`}
                                className="text-[11px] font-semibold text-teal-600 hover:text-teal-800"
                              >
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
                      <div className="px-4 py-1.5 bg-orange-50 border-b border-orange-100">
                        <p className="text-[10px] font-bold text-orange-600 uppercase tracking-widest flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />
                          Pending Approval
                        </p>
                      </div>
                      <div className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                        <span className="text-sm text-gray-700">
                          <strong>{pendingCount}</strong> task{pendingCount !== 1 ? 's' : ''} awaiting review
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Attention */}
                  {role === 'superadmin' && (staleCount > 0 || overdueCount > 0) && (
                    <div>
                      <div className="px-4 py-1.5 bg-yellow-50 border-b border-yellow-100">
                        <p className="text-[10px] font-bold text-yellow-700 uppercase tracking-widest flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
                          Attention
                        </p>
                      </div>
                      {staleCount > 0 && (
                        <div className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                          <span className="text-sm text-gray-700">
                            <strong>{staleCount}</strong> stale project{staleCount !== 1 ? 's' : ''} — no activity &gt;3 days
                          </span>
                        </div>
                      )}
                      {overdueCount > 0 && (
                        <div className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors border-t border-gray-50">
                          <span className="text-sm text-gray-700">
                            <strong>{overdueCount}</strong> overdue payment{overdueCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {totalAlerts === 0 && (
                    <div className="px-4 py-6 text-center">
                      <svg className="w-8 h-8 text-gray-200 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                      </svg>
                      <p className="text-sm text-gray-500 font-medium">All clear</p>
                      <p className="text-xs text-gray-400 mt-0.5">No active alerts</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleRefresh}
            title="Refresh data"
            disabled={isRefreshing}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <svg
              className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          {lastUpdated && (
            <span className="text-[11px] text-gray-400 hidden sm:block">{relativeTime}</span>
          )}
        </div>

        <div className="h-4 w-px bg-gray-200" />

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center">
            <span className="text-brand-700 text-xs font-semibold uppercase">
              {name ? name[0] : role[0]}
            </span>
          </div>
          <span className="text-sm text-gray-600">{name || ROLE_LABELS[role]}</span>
        </div>
      </div>
    </header>
  )
}
