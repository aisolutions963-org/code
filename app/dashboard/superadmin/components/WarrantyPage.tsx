'use client'

import useSWR from 'swr'
import Badge from '@/components/ui/Badge'
import { MaintenanceWithExtra } from './types'
import { fetcher, Spinner, MetricCard } from './shared'

export default function WarrantyPage() {
  const { data, isLoading } = useSWR<{ records: MaintenanceWithExtra[] }>(
    '/api/maintenance', fetcher, { refreshInterval: 300_000 },
  )
  const records = data?.records ?? []

  const expired = records.filter((r) => r.daysRemaining < 0).length
  const expiringSoon = records.filter((r) => r.daysRemaining >= 0 && r.daysRemaining < 30).length

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Warranty Tracker</h2>
        <p className="text-sm text-gray-500">Maintenance records sorted by expiry date</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Total" value={records.length} />
        <MetricCard label="Expiring Soon (< 30d)" value={expiringSoon} color="text-orange-500" />
        <MetricCard label="Expired" value={expired} color="text-red-600" />
      </div>

      {records.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-10">No maintenance records.</p>
      )}

      {records.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">ID</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Project</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Start</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">End</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Remaining</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {records.map((r) => {
                const d = r.daysRemaining
                const color = d < 0 ? 'red' : d < 30 ? 'orange' : 'green'
                const label = d < 0 ? `Expired ${Math.abs(d)}d ago` : `${d}d left`
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.maintenanceId}</td>
                    <td className="px-4 py-3 text-gray-700 text-xs">
                      {(r.projectNames ?? []).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.warrantyType ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.startDate}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{r.endDate}</td>
                    <td className="px-4 py-3">
                      <Badge variant={color}>{label}</Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
