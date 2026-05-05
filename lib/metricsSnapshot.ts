import { METRICS_SNAPSHOTS } from './fieldMap'
import { getMetrics, getSystemStatus } from './metrics'

const SNAPSHOT_INTERVAL_MS = 2 * 60 * 1000 // 2 minutes

const getBaseUrl = () =>
  `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${METRICS_SNAPSHOTS.TABLE_ID}`

const getHeaders = () => ({
  Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json',
})

async function writeSnapshot(): Promise<void> {
  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) return
  const m = getMetrics()
  const status = getSystemStatus()
  try {
    await fetch(getBaseUrl(), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        records: [
          {
            fields: {
              [METRICS_SNAPSHOTS.TIMESTAMP]: new Date().toISOString(),
              [METRICS_SNAPSHOTS.REQUEST_COUNT]: m.requestCount,
              [METRICS_SNAPSHOTS.ERROR_COUNT]: m.errorCount,
              [METRICS_SNAPSHOTS.ERROR_RATE]: m.errorRate,
              [METRICS_SNAPSHOTS.AVG_LATENCY_MS]: m.avgLatencyMs,
              [METRICS_SNAPSHOTS.AIRTABLE_FAILURES]: m.airtableFailures,
              [METRICS_SNAPSHOTS.STATUS]: status,
            },
          },
        ],
      }),
    })
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
