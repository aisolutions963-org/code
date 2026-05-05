'use client'

import { useState, useRef, useEffect } from 'react'
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
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function TopBar({ role, name }: { role: Role; name: string }) {
  const router = useRouter()
  const [bellOpen, setBellOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)

  const showPendingBell = role === 'manager' || role === 'superadmin'

  const { data: pendingData } = useSWR<{ count: number }>(
    showPendingBell ? '/api/tasks/pending-approvals' : null,
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true },
  )

  const { data: metricsData } = useSWR<SuperadminMetrics>(
    role === 'superadmin' ? '/api/superadmin/metrics' : null,
    fetcher,
    { refreshInterval: 60000, revalidateOnFocus: true },
  )

  const pendingCount = pendingData?.count ?? 0
  const staleCount = metricsData?.staleProjects ?? 0
  const overdueCount = metricsData?.overduePayments ?? 0
  const totalAlerts =
    pendingCount + (role === 'superadmin' ? staleCount + overdueCount : 0)

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
              <div className="absolute right-0 top-8 w-72 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Alerts</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {pendingCount > 0 && (
                    <div className="px-4 py-3 flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                      <span className="text-sm text-gray-700">
                        <strong>{pendingCount}</strong> task{pendingCount !== 1 ? 's' : ''} pending approval
                      </span>
                    </div>
                  )}
                  {role === 'superadmin' && staleCount > 0 && (
                    <div className="px-4 py-3 flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" />
                      <span className="text-sm text-gray-700">
                        <strong>{staleCount}</strong> stale project{staleCount !== 1 ? 's' : ''} (no activity &gt;3 days)
                      </span>
                    </div>
                  )}
                  {role === 'superadmin' && overdueCount > 0 && (
                    <div className="px-4 py-3 flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                      <span className="text-sm text-gray-700">
                        <strong>{overdueCount}</strong> overdue payment{overdueCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                  {totalAlerts === 0 && (
                    <div className="px-4 py-4 text-sm text-gray-500 text-center">
                      No active alerts
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => router.refresh()}
          title="Refresh data"
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

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
