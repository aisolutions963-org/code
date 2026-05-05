import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getMetrics, getSystemStatus } from '@/lib/metrics'
import { getLogs } from '@/lib/logger'
import { getFailedRequests } from '@/lib/failedRequests'
import { SYSTEM_LOGS } from '@/lib/fieldMap'

const AIRTABLE_BASE = process.env.AIRTABLE_BASE_ID
const AIRTABLE_KEY = process.env.AIRTABLE_API_KEY

async function checkAirtable(): Promise<'ok' | 'failing'> {
  if (!AIRTABLE_BASE || !AIRTABLE_KEY) return 'failing'
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE}/${SYSTEM_LOGS.TABLE_ID}?maxRecords=1`,
      { headers: { Authorization: `Bearer ${AIRTABLE_KEY}` }, cache: 'no-store' },
    )
    return res.ok ? 'ok' : 'failing'
  } catch {
    return 'failing'
  }
}

function checkDatabase(): 'ok' | 'failing' {
  try {
    // Dynamic require — SQLite is synchronous; if the module loads, the DB is reachable
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const db = require('@/lib/db').default
    db.prepare('SELECT 1').get()
    return 'ok'
  } catch {
    return 'failing'
  }
}

export const GET = requireRole('superadmin')(async () => {
  const [airtableStatus, recentErrors, failedRequests, metrics] = await Promise.all([
    checkAirtable(),
    getLogs({ level: 'error', limit: 20 }),
    getFailedRequests(20),
    Promise.resolve(getMetrics()),
  ])

  const databaseStatus = checkDatabase()
  const status = getSystemStatus(airtableStatus === 'failing')

  return NextResponse.json({
    status,
    uptime: Math.floor(metrics.uptimeMs / 1000),
    metrics,
    services: {
      airtable: airtableStatus,
      database: databaseStatus,
    },
    recentErrors,
    failedRequests,
    alerts: {
      highErrorRate: metrics.errorRate > 5,
      highLatency: metrics.avgLatencyMs > 2000,
      airtableUnhealthy: airtableStatus === 'failing',
      databaseUnhealthy: databaseStatus === 'failing',
    },
  })
})
