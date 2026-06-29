'use client'

import { useState } from 'react'
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { SedStat } from './types'

// ─── Shared helpers ──────────────────────────────────────────────────────────

export const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export function isStale(lastModified: string | undefined): boolean {
  if (!lastModified) return false
  return (Date.now() - new Date(lastModified).getTime()) / (1000 * 60 * 60 * 24) > 3
}

export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export function MetricCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
      <p className={`text-2xl font-bold ${color ?? 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export function SedChart({ data, seds }: { data: SedStat[]; seds: string[] }) {
  const [selectedSed, setSelectedSed] = useState<string | null>(null)

  const chartData = selectedSed
    ? [
        { name: 'Preparing', value: data.find((d) => d.sedName === selectedSed)?.preparing ?? 0, fill: '#3b82f6' },
        { name: 'Open', value: data.find((d) => d.sedName === selectedSed)?.open ?? 0, fill: '#16a34a' },
        { name: 'Production', value: data.find((d) => d.sedName === selectedSed)?.production ?? 0, fill: '#f59e0b' },
        { name: 'Warranty', value: data.find((d) => d.sedName === selectedSed)?.warranty ?? 0, fill: '#a78bfa' },
        { name: 'Warranty Expired', value: data.find((d) => d.sedName === selectedSed)?.warrantyExpired ?? 0, fill: '#94a3b8' },
        { name: 'Closed', value: data.find((d) => d.sedName === selectedSed)?.closed ?? 0, fill: '#f9a8d4' },
        { name: 'Not Approved', value: data.find((d) => d.sedName === selectedSed)?.notApproved ?? 0, fill: '#dc2626' },
      ]
    : data.map((d) => ({
        name: d.sedName,
        preparing: d.preparing,
        open: d.open,
        production: d.production,
        warranty: d.warranty,
        warrantyExpired: d.warrantyExpired,
        closed: d.closed,
        notApproved: d.notApproved,
      }))

  const maxVal = selectedSed
    ? Math.max(...(chartData as { value: number }[]).map((d) => d.value), 1)
    : Math.max(...data.map((d) => d.preparing + d.open + d.production + d.warranty + d.warrantyExpired + d.closed + d.notApproved), 1)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-gray-700">
          {selectedSed ? `${selectedSed}'s Projects` : 'SED Performance'}
        </p>
        <div className="flex gap-1 flex-wrap">
          {seds.map((s) => (
            <button
              key={s}
              onClick={() => setSelectedSed(selectedSed === s ? null : s)}
              className={`px-2.5 py-1 text-xs rounded-full border font-medium transition-colors ${
                selectedSed === s
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'text-gray-500 border-gray-200 hover:border-brand-300 hover:text-brand-600'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-3">
          {[
            { label: 'Preparing', color: '#3b82f6' },
            { label: 'Open', color: '#16a34a' },
            { label: 'Production', color: '#f59e0b' },
            { label: 'Warranty', color: '#a78bfa' },
            { label: 'Warranty Expired', color: '#94a3b8' },
            { label: 'Closed', color: '#f9a8d4' },
            { label: 'Not Approved', color: '#dc2626' },
          ].map((l) => (
            <span key={l.label} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={Math.max(160, (selectedSed ? 7 : data.length) * 68)}>
          {selectedSed ? (
            <BarChart
              layout="vertical"
              data={chartData as { name: string; value: number; fill: string }[]}
              margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
              <XAxis type="number" domain={[0, maxVal]} allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="value" radius={[0, 3, 3, 0]} name="Projects">
                {(chartData as { name: string; value: number; fill: string }[]).map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <BarChart
              layout="vertical"
              data={chartData as { name: string; preparing: number; open: number; production: number; warranty: number; warrantyExpired: number; closed: number; notApproved: number }[]}
              margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
              <XAxis type="number" domain={[0, maxVal]} allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="preparing" fill="#3b82f6" radius={[0, 3, 3, 0]} name="Preparing" stackId="a" />
              <Bar dataKey="open" fill="#16a34a" radius={[0, 0, 0, 0]} name="Open" stackId="a" />
              <Bar dataKey="production" fill="#f59e0b" radius={[0, 0, 0, 0]} name="Production" stackId="a" />
              <Bar dataKey="warranty" fill="#a78bfa" radius={[0, 0, 0, 0]} name="Warranty" stackId="a" />
              <Bar dataKey="warrantyExpired" fill="#94a3b8" radius={[0, 0, 0, 0]} name="Warranty Expired" stackId="a" />
              <Bar dataKey="closed" fill="#f9a8d4" radius={[0, 0, 0, 0]} name="Closed" stackId="a" />
              <Bar dataKey="notApproved" fill="#dc2626" radius={[0, 3, 3, 0]} name="Not Approved" stackId="a" />
            </BarChart>
          )}
        </ResponsiveContainer>

        {/* Commission summary table */}
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Commission (tiered — 1.5% silver · 2% gold)</p>
          <div className="space-y-1">
            {(selectedSed ? data.filter((d) => d.sedName === selectedSed) : data).map((d) => {
              const tier = d.totalPaid >= 600_000 ? 'gold' : d.totalPaid >= 300_000 ? 'silver' : null
              return (
              <div key={d.sedName} className="flex items-start flex-wrap justify-between gap-1 text-xs">
                <span className="text-gray-600 font-medium truncate">{d.sedName}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {tier && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tier === 'gold' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                      {tier}
                    </span>
                  )}
                  <span className="text-gray-400">Paid: AED {d.totalPaid.toLocaleString()}</span>
                  <span className="font-semibold text-emerald-600">AED {d.commission.toLocaleString()}</span>
                </div>
              </div>
            )})}
          </div>
        </div>
      </div>
    </div>
  )
}
