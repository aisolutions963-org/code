import db from './db'
import { getMetrics, getSystemStatus } from './metrics'

const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const RETENTION_DAYS = 7

const insert = db.prepare(`
  INSERT INTO metrics_snapshots
    (timestamp, request_count, error_count, error_rate, avg_latency_ms, airtable_failures, status)
  VALUES (datetime('now'), ?, ?, ?, ?, ?, ?)
`)

const prune = db.prepare(
  `DELETE FROM metrics_snapshots WHERE timestamp < datetime('now', '-${RETENTION_DAYS} days')`,
)

function writeSnapshot(): void {
  try {
    const m = getMetrics()
    const status = getSystemStatus()
    insert.run(m.requestCount, m.errorCount, m.errorRate, m.avgLatencyMs, m.airtableFailures, status)
    prune.run()
  } catch (err) {
    console.error('[MetricsSnapshot] Write failed:', err)
  }
}

let _started = false

export function startMetricsSnapshots(): void {
  if (_started || typeof setInterval === 'undefined') return
  _started = true
  setInterval(writeSnapshot, SNAPSHOT_INTERVAL_MS)
}
