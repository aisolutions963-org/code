import { db } from './db'
import { getMetrics, getSystemStatus } from './metrics'

const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000
const RETENTION_DAYS = 7

async function writeSnapshot(): Promise<void> {
  try {
    const c = await db()
    const m = getMetrics()
    const status = getSystemStatus()
    await c.execute({
      sql: `INSERT INTO metrics_snapshots (timestamp, request_count, error_count, error_rate, avg_latency_ms, airtable_failures, status)
            VALUES (datetime('now'), ?, ?, ?, ?, ?, ?)`,
      args: [m.requestCount, m.errorCount, m.errorRate, m.avgLatencyMs, m.airtableFailures, status],
    })
    await c.execute({
      sql: `DELETE FROM metrics_snapshots WHERE timestamp < datetime('now', '-${RETENTION_DAYS} days')`,
      args: [],
    })
  } catch (err) {
    console.error('[MetricsSnapshot] Write failed:', err)
  }
}

let _started = false

export function startMetricsSnapshots(): void {
  if (_started || typeof setInterval === 'undefined') return
  _started = true
  setInterval(() => { writeSnapshot().catch(console.error) }, SNAPSHOT_INTERVAL_MS)
}
