import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { buildXlsx, xlsxResponse } from '@/lib/xlsxHelper'
import { getTimesheetEntries } from '@/lib/airtable'

export const dynamic = 'force-dynamic'

export const GET = requireRole('superadmin')(async (req: NextRequest) => {
  const url = new URL(req.url)
  const from = url.searchParams.get('from') ?? undefined
  const to = url.searchParams.get('to') ?? undefined

  const entries = await getTimesheetEntries({ from, to })

  const rows = entries.map((e) => ({
    workDate: e.workDate,
    workerName: e.workerName ?? e.workerIds[0] ?? '',
    projectRef: e.projectRef ?? e.projectIds[0] ?? '',
    regularHours: e.regularHours,
    overtimeHours: e.overtimeHours,
    totalHours: e.totalHours,
    notes: e.notes ?? '',
  }))

  const buffer = await buildXlsx('Timesheets', [
    { header: 'Date', key: 'workDate', width: 14, isDate: true },
    { header: 'Worker', key: 'workerName', width: 22 },
    { header: 'Project', key: 'projectRef', width: 24 },
    { header: 'Regular Hrs', key: 'regularHours', width: 12 },
    { header: 'Overtime Hrs', key: 'overtimeHours', width: 12 },
    { header: 'Total Hrs', key: 'totalHours', width: 12 },
    { header: 'Notes', key: 'notes', width: 30 },
  ], rows)

  return xlsxResponse(buffer, 'Production_Timesheets')
}) as (req: NextRequest) => Promise<NextResponse>
