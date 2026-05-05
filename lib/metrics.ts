const LATENCY_BUFFER_SIZE = 500

interface MetricsState {
  requestCount: number
  errorCount: number
  successCount: number
  totalLatencyMs: number
  airtableFailures: number
  rateLimitHits: number
  latencies: number[]
  startedAt: number
  lastErrorAt: number | null
}

const _metrics: MetricsState = {
  requestCount: 0,
  errorCount: 0,
  successCount: 0,
  totalLatencyMs: 0,
  airtableFailures: 0,
  rateLimitHits: 0,
  latencies: [],
  startedAt: Date.now(),
  lastErrorAt: null,
}

export function recordRequest(durationMs: number, success: boolean): void {
  _metrics.requestCount++
  _metrics.totalLatencyMs += durationMs
  if (success) {
    _metrics.successCount++
  } else {
    _metrics.errorCount++
    _metrics.lastErrorAt = Date.now()
  }
  if (_metrics.latencies.length >= LATENCY_BUFFER_SIZE) {
    _metrics.latencies.shift()
  }
  _metrics.latencies.push(durationMs)
}

export function recordAirtableFailure(): void {
  _metrics.airtableFailures++
}

export function recordRateLimit(): void {
  _metrics.rateLimitHits++
}

export function getMetrics() {
  const count = _metrics.requestCount
  const avgLatencyMs = count > 0 ? Math.round(_metrics.totalLatencyMs / count) : 0
  const sorted = [..._metrics.latencies].sort((a, b) => a - b)
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1)
  const p95LatencyMs = sorted[p95Index] ?? 0
  const errorRate = count > 0 ? Math.round((_metrics.errorCount / count) * 1000) / 10 : 0
  const successRate = Math.round((100 - errorRate) * 10) / 10

  return {
    requestCount: _metrics.requestCount,
    errorCount: _metrics.errorCount,
    successCount: _metrics.successCount,
    avgLatencyMs,
    p95LatencyMs,
    errorRate,
    successRate,
    airtableFailures: _metrics.airtableFailures,
    rateLimitHits: _metrics.rateLimitHits,
    uptimeMs: Date.now() - _metrics.startedAt,
    lastErrorAt: _metrics.lastErrorAt ? new Date(_metrics.lastErrorAt).toISOString() : null,
  }
}

// Thresholds per spec: ok < 2%, degraded 2–5%, critical > 5% or airtable failing
export function getSystemStatus(airtableFailing = false): 'ok' | 'degraded' | 'critical' {
  const m = getMetrics()
  if (m.errorRate > 5 || airtableFailing) return 'critical'
  if (m.errorRate >= 2) return 'degraded'
  return 'ok'
}
