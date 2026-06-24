'use client'

import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import useSWR from 'swr'
import { WorkHourEntry } from './types'
import { fetcher } from './shared'

export default function WorkHoursChart() {
  const now = new Date()
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
  )

  const { data, isLoading } = useSWR<{ data: WorkHourEntry[] }>(
    `/api/superadmin/work-hours-by-project?month=${month}`,
    fetcher,
    { refreshInterval: 300_000 },
  )

  function shiftMonth(delta: number) {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const monthLabel = (() => {
    const [y, m] = month.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' })
  })()

  const chartData = data?.data ?? []
  const maxHours = Math.max(...chartData.map((d) => d.hours), 1)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-gray-700">Work Hours by Project</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftMonth(-1)}
            className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:border-brand-300 hover:text-brand-600 transition-colors text-xs"
          >
            ‹
          </button>
          <span className="text-xs text-gray-600 font-medium min-w-[110px] text-center">{monthLabel}</span>
          <button
            onClick={() => shiftMonth(1)}
            className="w-6 h-6 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:border-brand-300 hover:text-brand-600 transition-colors text-xs"
          >
            ›
          </button>
          <a
            href={`/api/reports/download/timesheets?month=${month}`}
            title="Download Timesheets"
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-green-50 text-green-600 hover:text-green-700 transition-colors ml-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </a>
        </div>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : chartData.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-8">No timesheet data for {monthLabel}</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(120, chartData.length * 36)}>
            <BarChart
              layout="vertical"
              data={chartData}
              margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
              <XAxis type="number" domain={[0, maxHours]} allowDecimals={false} tick={{ fontSize: 11 }} unit="h" />
              <YAxis
                type="category"
                dataKey="project"
                tick={{ fontSize: 10 }}
                width={160}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(v) => [`${v} hrs`, 'Hours']}
              />
              <Bar dataKey="hours" radius={[0, 3, 3, 0]} fill="#6366f1" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
