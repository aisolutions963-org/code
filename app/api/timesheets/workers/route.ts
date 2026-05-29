import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getTimesheetWorkers } from '@/lib/airtable'

export const dynamic = 'force-dynamic'

export const GET = requireRole('manager', 'superadmin')(async () => {
  const workers = await getTimesheetWorkers()
  return NextResponse.json({ workers })
})
