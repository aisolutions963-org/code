import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { buildXlsx, xlsxResponse } from '@/lib/xlsxHelper'

export const dynamic = 'force-dynamic'

export const GET = requireRole('superadmin')(async (_req: NextRequest) => {
  // Timesheet table not yet implemented — return template with headers only
  const buffer = await buildXlsx('Timesheets', [
    { header: 'Week Starting', key: 'weekStart', width: 14, isDate: true },
    { header: 'Worker Name', key: 'workerName', width: 20 },
    { header: 'Nickname', key: 'nickname', width: 14 },
    { header: 'Project', key: 'project', width: 26 },
    { header: 'Sat', key: 'sat', width: 6 },
    { header: 'Sun', key: 'sun', width: 6 },
    { header: 'Mon', key: 'mon', width: 6 },
    { header: 'Tue', key: 'tue', width: 6 },
    { header: 'Wed', key: 'wed', width: 6 },
    { header: 'Thu', key: 'thu', width: 6 },
    { header: 'Fri', key: 'fri', width: 6 },
    { header: 'Regular Total', key: 'regularTotal', width: 14 },
    { header: 'Overtime', key: 'overtime', width: 10 },
    { header: 'Grand Total', key: 'grandTotal', width: 12 },
    { header: 'Manager Approved', key: 'approved', width: 16 },
  ], [])

  return xlsxResponse(buffer, 'Production_Timesheets')
}) as (req: NextRequest) => Promise<NextResponse>
