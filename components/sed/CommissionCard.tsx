'use client'

import { useState } from 'react'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface CommissionData {
  quarterLabel: string
  quarterRevenue: number
  tier: 'none' | 'silver' | 'gold'
  rate: number
  amount: number
  nextThreshold: number | null
  toNext: number | null
  breakdown?: { projectId: string; name: string; revenue: number }[]
}

function fmt(n: number) {
  return n.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function CommissionCard({ className }: { className?: string }) {
  const [expanded, setExpanded] = useState(false)
  const { data, isLoading, error } = useSWR<CommissionData>('/api/sed/commission', fetcher, {
    refreshInterval: 300_000,
  })

  if (isLoading) {
    return (
      <div className={`bg-white rounded-xl border border-gray-200 p-4 shadow-sm animate-pulse h-[120px] ${className ?? ''}`} />
    )
  }

  if (error || !data) {
    return (
      <div className={`bg-white rounded-xl border border-gray-200 p-4 shadow-sm ${className ?? ''}`}>
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Commission</p>
        <p className="text-xs text-red-400">Could not load commission data</p>
      </div>
    )
  }

  const { quarterLabel, quarterRevenue, tier, amount, nextThreshold, toNext, breakdown } = data

  const tierBadge =
    tier === 'gold'
      ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
      : tier === 'silver'
      ? 'bg-blue-100 text-blue-700 border-blue-300'
      : 'bg-gray-100 text-gray-500 border-gray-200'

  const barColor =
    tier === 'gold' ? 'bg-yellow-400' : tier === 'silver' ? 'bg-blue-500' : 'bg-gray-400'

  const barFill = Math.min(quarterRevenue / 600_000, 1)

  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-4 shadow-sm ${className ?? ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
            {quarterLabel} · Revenue
          </p>
          <p className="text-xl font-bold text-gray-900 mt-0.5">AED {fmt(quarterRevenue)}</p>
        </div>
        <div className={`border rounded-full px-2.5 py-0.5 text-xs font-semibold ${tierBadge}`}>
          {tier === 'none' ? 'No commission' : tier === 'silver' ? '1.5%' : '2%'}
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative mb-3">
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${barFill * 100}%` }}
          />
        </div>
        {/* 300k threshold marker at 50% */}
        <div className="absolute top-0 h-2 w-px bg-gray-400 opacity-70" style={{ left: '50%' }} />
        <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-px">
          <span>0</span>
          <span>300k</span>
          <span>600k</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        {amount > 0 ? (
          <p className="text-xs text-gray-700 font-medium">
            Earned:{' '}
            <span className="text-green-600 font-bold">AED {fmt(amount)}</span>
          </p>
        ) : (
          <p className="text-xs text-gray-400">No commission until AED 300,000</p>
        )}
        {toNext !== null && nextThreshold !== null && (
          <p className="text-xs text-gray-400">
            {tier === 'none' ? `${fmt(toNext)} more → 1.5%` : `${fmt(toNext)} more → 2%`}
          </p>
        )}
        {tier === 'gold' && (
          <p className="text-xs text-yellow-600 font-semibold">2% tier reached</p>
        )}
      </div>

      {/* Per-project breakdown */}
      {breakdown && breakdown.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 font-medium"
          >
            <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {expanded ? 'Hide' : 'View'} breakdown ({breakdown.length})
          </button>
          {expanded && (
            <div className="mt-2 space-y-1">
              {breakdown.map((b) => (
                <div key={b.projectId} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-gray-600 truncate">{b.name}</span>
                  <span className="font-mono font-medium text-gray-800 shrink-0">AED {fmt(b.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
