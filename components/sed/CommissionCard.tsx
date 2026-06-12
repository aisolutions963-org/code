'use client'

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
}

function fmt(n: number) {
  return n.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function CommissionCard({ className }: { className?: string }) {
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

  const { quarterLabel, quarterRevenue, tier, amount, nextThreshold, toNext } = data

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
    </div>
  )
}
