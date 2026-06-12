import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getMetrics, getSystemStatus } from '@/lib/metrics'
import { getLogs } from '@/lib/logger'
import { getFailedRequests } from '@/lib/failedRequests'
import { SYSTEM_LOGS } from '@/lib/fieldMap'
import { db } from '@/lib/db'

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

async function checkDatabase(): Promise<'ok' | 'failing'> {
  try {
    const client = await db()
    await client.execute('SELECT 1')
    return 'ok'
  } catch {
    return 'failing'
  }
}

export const GET = requireRole('superadmin')(async () => {
  const [airtableStatus, databaseStatus, recentErrors, failedRequests, metrics] = await Promise.all([
    checkAirtable(),
    checkDatabase(),
    getLogs({ level: 'error', limit: 20 }),
    getFailedRequests(20),
    Promise.resolve(getMetrics()),
  ])
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
