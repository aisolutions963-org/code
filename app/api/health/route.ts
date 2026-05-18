import { NextResponse } from 'next/server'
import { getMetrics, getSystemStatus } from '@/lib/metrics'
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

export async function GET() {
  const [airtableStatus, metrics] = await Promise.all([
    checkAirtable(),
    Promise.resolve(getMetrics()),
  ])

  const status = getSystemStatus(airtableStatus === 'failing')

  return NextResponse.json({
    status,
    metrics: {
      errorRate: metrics.errorRate,
      avgLatency: metrics.avgLatencyMs,
      requestCount: metrics.requestCount,
    },
    services: {
      airtable: airtableStatus,
    },
    lastError: metrics.lastErrorAt,
  })
}
