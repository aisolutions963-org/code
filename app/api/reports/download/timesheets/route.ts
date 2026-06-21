import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { buildMultiSheetXlsx, xlsxResponse } from '@/lib/xlsxHelper'
import { getTimesheetEntries } from '@/lib/airtable'

export const dynamic = 'force-dynamic'

export const GET = requireRole('superadmin')(async (req: NextRequest) => {
  const url = new URL(req.url)
  const month = url.searchParams.get('month') ?? '' // YYYY-MM
  const from  = url.searchParams.get('from')  ?? undefined
  const to    = url.searchParams.get('to')    ?? undefined

  let dateFrom = from
  let dateTo   = to
  let label    = 'All'

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number)
    dateFrom = `${month}-01`
    const lastDay = new Date(y, m, 0).getDate() // last day of month
    dateTo = `${month}-${String(lastDay).padStart(2, '0')}`
    const monthName = new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' })
    label = monthName
  }

  const entries = await getTimesheetEntries({ from: dateFrom, to: dateTo })

  // Sheet 1 — Monthly summary: one row per worker, totals
  const workerSummary = new Map<string, {
    workerName: string
    regularHours: number
    overtimeHours: number
    totalHours: number
    days: Set<string>
  }>()

  for (const e of entries) {
    const key = e.supervisorId ?? e.workerIds[0] ?? 'unknown'
    const name = e.supervisorName ?? e.workerName ?? key
    if (!workerSummary.has(key)) {
      workerSummary.set(key, { workerName: name, regularHours: 0, overtimeHours: 0, totalHours: 0, days: new Set() })
    }
    const row = workerSummary.get(key)!
    row.regularHours  += e.regularHours
    row.overtimeHours += e.overtimeHours
    row.totalHours    += e.totalHours
    if (e.workDate) row.days.add(e.workDate)
  }

  const summaryRows = Array.from(workerSummary.values())
    .sort((a, b) => b.totalHours - a.totalHours)
    .map((w) => ({
      worker:       w.workerName,
      daysWorked:   w.days.size,
      regularHours: w.regularHours,
      overtimeHours:w.overtimeHours,
      totalHours:   w.totalHours,
    }))

  // Sheet 2 — Daily detail: one row per entry
  const detailRows = entries.map((e) => ({
    workDate:     e.workDate,
    workerName:   e.supervisorName ?? e.workerName ?? e.workerIds[0] ?? '',
    projectRef:   e.projectRef ?? e.projectIds[0] ?? '',
    regularHours: e.regularHours,
    overtimeHours:e.overtimeHours,
    totalHours:   e.totalHours,
    notes:        e.notes ?? '',
  }))

  const buffer = await buildMultiSheetXlsx([
    {
      name: `Summary (${label})`,
      columns: [
        { header: 'Worker',          key: 'worker',        width: 24 },
        { header: 'Days Worked',     key: 'daysWorked',    width: 12 },
        { header: 'Regular Hrs',     key: 'regularHours',  width: 14 },
        { header: 'Overtime Hrs',    key: 'overtimeHours', width: 14 },
        { header: 'Total Hrs',       key: 'totalHours',    width: 12 },
      ],
      rows: summaryRows,
    },
    {
      name: 'Daily Detail',
      columns: [
        { header: 'Date',            key: 'workDate',      width: 14, isDate: true },
        { header: 'Worker',          key: 'workerName',    width: 22 },
        { header: 'Project',         key: 'projectRef',    width: 24 },
        { header: 'Regular Hrs',     key: 'regularHours',  width: 12 },
        { header: 'Overtime Hrs',    key: 'overtimeHours', width: 12 },
        { header: 'Total Hrs',       key: 'totalHours',    width: 12 },
        { header: 'Notes',           key: 'notes',         width: 30 },
      ],
      rows: detailRows,
    },
  ])

  const filename = month ? `Timesheets_${month}` : 'Production_Timesheets'
  return xlsxResponse(buffer, filename)
}) as (req: NextRequest) => Promise<NextResponse>
