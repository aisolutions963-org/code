'use client'

import { useState } from 'react'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Status = 'ok' | 'degraded' | 'critical'

interface HealthData {
  status: Status
  uptime: number
  metrics: {
    requestCount: number
    errorCount: number
    successCount: number
    successRate: number
    avgLatencyMs: number
    p95LatencyMs: number
    errorRate: number
    airtableFailures: number
    rateLimitHits: number
  }
  services: { airtable: string; database: string }
  recentErrors: {
    id: string
    event: string
    level: string
    requestId: string
    userId?: string
    durationMs?: number
    metadata?: Record<string, unknown>
    timestamp: string
  }[]
  failedRequests: {
    id: string
    requestId: string
    endpoint: string
    method: string
    event: string
    errorMessage: string
    statusCode: number
    inputPayload?: unknown
    replayed: boolean
    replayResult?: string
    timestamp: string
  }[]
  alerts: {
    highErrorRate: boolean
    highLatency: boolean
    airtableUnhealthy: boolean
    databaseUnhealthy: boolean
  }
}

interface TraceLog {
  id: string
  event: string
  level: string
  requestId: string
  durationMs?: number
  metadata?: Record<string, unknown>
  timestamp: string
}

function StatusBadge({ status }: { status: Status }) {
  const cfg = {
    ok: { bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-500', label: 'Healthy' },
    degraded: { bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-500', label: 'Degraded' },
    critical: { bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-500', label: 'Critical' },
  }[status]
  return (
    <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot} animate-pulse`} />
      {cfg.label}
    </span>
  )
}

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function ServiceDot({ status }: { status: string }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${status === 'connected' ? 'bg-green-500' : 'bg-red-500'}`} />
  )
}

function formatTs(ts: string) {
  try {
    return new Date(ts).toLocaleString('en-GB', {
      timeZone: 'Asia/Dubai',
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch {
    return ts
  }
}

function formatUptime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function AdminHealthPage() {
  const { data, error, mutate } = useSWR<HealthData>('/api/admin/health', fetcher, {
    refreshInterval: 300_000,
  })
  const [expandedError, setExpandedError] = useState<string | null>(null)
  const [traceId, setTraceId] = useState('')
  const [traceLogs, setTraceLogs] = useState<TraceLog[] | null>(null)
  const [traceLoading, setTraceLoading] = useState(false)
  const [replayingId, setReplayingId] = useState<string | null>(null)
  const [replayResults, setReplayResults] = useState<Record<string, string>>({})

  async function searchTrace() {
    if (!traceId.trim()) return
    setTraceLoading(true)
    try {
      const res = await fetch(`/api/admin/logs?requestId=${encodeURIComponent(traceId.trim())}`)
      const json = await res.json() as { logs: TraceLog[] }
      setTraceLogs(json.logs)
    } finally {
      setTraceLoading(false)
    }
  }

  async function replayRequest(
    failedReqId: string,
    endpoint: string,
    method: string,
    payload: unknown,
  ) {
    setReplayingId(failedReqId)
    try {
      const apiRes = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: ['GET', 'DELETE'].includes(method) ? undefined : JSON.stringify(payload),
      })
      const result = `${apiRes.status} ${apiRes.statusText}`
      await fetch(`/api/admin/replay/${failedReqId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result }),
      })
      setReplayResults((prev) => ({ ...prev, [failedReqId]: result }))
      mutate()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Replay failed'
      setReplayResults((prev) => ({ ...prev, [failedReqId]: `Error: ${msg}` }))
    } finally {
      setReplayingId(null)
    }
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-600">
        Failed to load health data. You may not have superadmin access.
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-gray-700 rounded-full" />
      </div>
    )
  }

  const activeAlerts = Object.entries(data.alerts)
    .filter(([, v]) => v)
    .map(([k]) => k)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">System Health</h1>
          <p className="text-sm text-gray-500 mt-0.5">Uptime: {formatUptime(data.uptime)} · Auto-refreshes every 20s</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={data.status} />
          <button
            onClick={() => mutate()}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border border-gray-200 rounded-lg"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Alerts */}
      {activeAlerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-700 mb-1">Active Alerts</p>
          <ul className="list-disc list-inside text-sm text-red-600 space-y-0.5">
            {activeAlerts.map((a) => (
              <li key={a}>{a.replace(/([A-Z])/g, ' $1').trim()}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Services */}
      <div className="flex gap-4">
        {Object.entries(data.services).map(([name, status]) => (
          <div key={name} className="bg-white border border-gray-200 rounded-lg px-3 py-2 flex items-center text-sm">
            <ServiceDot status={status} />
            <span className="font-medium capitalize">{name}</span>
            <span className="ml-1 text-gray-400">({status})</span>
          </div>
        ))}
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total Requests" value={data.metrics.requestCount} />
        <MetricCard label="Error Rate" value={`${data.metrics.errorRate}%`} sub={`${data.metrics.errorCount ?? ''} errors`} />
        <MetricCard label="Avg Latency" value={`${data.metrics.avgLatencyMs}ms`} sub={`p95: ${data.metrics.p95LatencyMs}ms`} />
        <MetricCard label="Airtable Failures" value={data.metrics.airtableFailures} sub={`Rate limits: ${data.metrics.rateLimitHits}`} />
      </div>

      {/* Recent errors */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">Recent Errors</h2>
        </div>
        {data.recentErrors.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400 text-center">No errors recorded</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {data.recentErrors.map((e) => (
              <div key={e.id}>
                <button
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedError(expandedError === e.id ? null : e.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">{e.event}</p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">{e.requestId}</p>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{formatTs(e.timestamp)}</span>
                  </div>
                </button>
                {expandedError === e.id && e.metadata && (
                  <div className="px-4 pb-3">
                    <pre className="text-xs bg-gray-50 rounded-lg p-3 overflow-x-auto text-gray-700">
                      {JSON.stringify(e.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Trace viewer */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Request Trace</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={traceId}
            onChange={(e) => setTraceId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchTrace()}
            placeholder="Enter Request ID..."
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300 font-mono"
          />
          <button
            onClick={searchTrace}
            disabled={traceLoading}
            className="px-4 py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {traceLoading ? 'Searching…' : 'Trace'}
          </button>
        </div>
        {traceLogs !== null && (
          <div className="mt-3 space-y-1.5">
            {traceLogs.length === 0 ? (
              <p className="text-sm text-gray-400">No logs found for this request ID.</p>
            ) : (
              traceLogs.map((l) => (
                <div
                  key={l.id}
                  className={`rounded-lg px-3 py-2 text-xs font-mono ${
                    l.level === 'error'
                      ? 'bg-red-50 text-red-700'
                      : l.level === 'warn'
                        ? 'bg-yellow-50 text-yellow-700'
                        : 'bg-gray-50 text-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold uppercase">{l.level}</span>
                    <span className="text-gray-400">{formatTs(l.timestamp)}</span>
                    {l.durationMs !== undefined && (
                      <span className="text-gray-400">{l.durationMs}ms</span>
                    )}
                  </div>
                  <div>{l.event}</div>
                  {l.metadata && (
                    <pre className="mt-1 text-xs opacity-75 whitespace-pre-wrap">
                      {JSON.stringify(l.metadata)}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Failed requests */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">Failed Requests</h2>
        </div>
        {data.failedRequests.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400 text-center">No failed requests recorded</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  {['Timestamp', 'Method', 'Endpoint', 'Event', 'Status', 'Replay'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.failedRequests.map((fr) => (
                  <tr key={fr.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-500">{formatTs(fr.timestamp)}</td>
                    <td className="px-3 py-2">
                      <span className="font-mono font-semibold text-gray-700">{fr.method}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-700 max-w-[200px] truncate">{fr.endpoint}</td>
                    <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate" title={fr.errorMessage}>
                      {fr.event}
                    </td>
                    <td className="px-3 py-2">
                      <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-mono">
                        {fr.statusCode}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {fr.replayed ? (
                        <span className="text-green-600 font-medium">
                          {replayResults[fr.id] ?? fr.replayResult ?? 'Replayed'}
                        </span>
                      ) : (
                        <button
                          onClick={() =>
                            replayRequest(fr.id, fr.endpoint, fr.method, fr.inputPayload)
                          }
                          disabled={replayingId === fr.id}
                          className="px-2 py-1 bg-gray-800 text-white rounded hover:bg-gray-700 disabled:opacity-50 transition-colors"
                        >
                          {replayingId === fr.id ? 'Replaying…' : 'Replay'}
                        </button>
                      )}
                      {replayResults[fr.id] && !fr.replayed && (
                        <span className="ml-2 text-gray-500">{replayResults[fr.id]}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
