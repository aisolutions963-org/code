'use client'

import useSWR from 'swr'
import { TimelineProject } from './types'
import { fetcher, Spinner } from './shared'

const TYPE_COLORS: Record<string, string> = {
  installation: 'bg-blue-500',
  delivery: 'bg-green-500',
  activity: 'bg-purple-500',
}

export default function TimelinePage() {
  const { data, isLoading } = useSWR<{ projects: TimelineProject[] }>(
    '/api/superadmin/timeline', fetcher, { refreshInterval: 300_000 },
  )

  if (isLoading) return <Spinner />

  const projects = data?.projects ?? []
  const now = new Date()
  const start = new Date(now); start.setDate(now.getDate() - 14)
  const end = new Date(now); end.setDate(now.getDate() + 76)
  const totalDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)

  function pct(dateStr: string): number {
    const t = new Date(dateStr).getTime()
    return Math.max(0, Math.min(100, ((t - start.getTime()) / (end.getTime() - start.getTime())) * 100))
  }

  const months: { label: string; left: number }[] = []
  const cur = new Date(start)
  cur.setDate(1)
  while (cur <= end) {
    months.push({
      label: cur.toLocaleString('default', { month: 'short', year: '2-digit' }),
      left: pct(cur.toISOString()),
    })
    cur.setMonth(cur.getMonth() + 1)
  }

  if (projects.length === 0) {
    return <div className="py-16 text-center text-sm text-gray-400">No active projects with upcoming dates.</div>
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">3-Month Timeline</h2>
        <p className="text-sm text-gray-500">Upcoming milestones across active projects (±14 days / +76 days)</p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        {Object.entries(TYPE_COLORS).map(([type, cls]) => (
          <span key={type} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${cls}`} />
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </span>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Month header */}
        <div className="relative h-8 border-b border-gray-100 bg-gray-50">
          {months.map((m, i) => (
            <span
              key={i}
              className="absolute top-1.5 text-xs text-gray-400"
              style={{ left: `calc(${m.left}% + 8px)` }}
            >
              {m.label}
            </span>
          ))}
          {/* Today line */}
          <div
            className="absolute top-0 bottom-0 w-px bg-red-400"
            style={{ left: `${pct(now.toISOString())}%` }}
          />
        </div>

        {projects.map((proj) => (
          <div key={proj.id} className="flex items-center border-b border-gray-50 last:border-0 group">
            {/* Project label */}
            <div className="w-28 sm:w-48 shrink-0 px-4 py-3 border-r border-gray-100">
              <p className="text-xs font-medium text-gray-800 truncate">{proj.projectName}</p>
              <p className="text-xs text-gray-400 truncate">{proj.clientName}</p>
            </div>
            {/* Track */}
            <div className="flex-1 relative h-12 overflow-hidden">
              {/* Today line */}
              <div
                className="absolute top-0 bottom-0 w-px bg-red-200"
                style={{ left: `${pct(now.toISOString())}%` }}
              />
              {proj.items.map((item) => {
                const left = pct(item.date)
                const color = TYPE_COLORS[item.type] ?? 'bg-gray-400'
                return (
                  <div
                    key={item.id}
                    title={`${item.title} — ${item.date}`}
                    className="absolute top-1/2 -translate-y-1/2 group/pin"
                    style={{ left: `${left}%` }}
                  >
                    <div className={`w-3 h-3 rotate-45 ${color} border-2 border-white shadow-sm`} />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10 hidden group-hover/pin:block">
                      {item.title} · {item.date.slice(5)}
                    </div>
                  </div>
                )
              })}
              {proj.items.length === 0 && (
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-300">No upcoming events</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400">
        Showing {totalDays.toFixed(0)}-day window. Hover pins for details.
      </p>
    </div>
  )
}
