import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getTimesheetWeeklySummary } from '@/lib/airtable'

export const dynamic = 'force-dynamic'

export const GET = requireRole('manager', 'superadmin')(async (req) => {
  const url = new URL(req.url)
  const weekStart = url.searchParams.get('weekStart')
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: 'weekStart (YYYY-MM-DD) is required' }, { status: 400 })
  }
  const summary = await getTimesheetWeeklySummary(weekStart)
  return NextResponse.json({ summary })
})
