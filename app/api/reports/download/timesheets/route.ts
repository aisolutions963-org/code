import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { PRODUCTION_TIMESHEETS, WORKERS } from '@/lib/fieldMap'
import { buildXlsx, xlsxResponse } from '@/lib/xlsxHelper'

export const dynamic = 'force-dynamic'

const BASE_ID = process.env.AIRTABLE_BASE_ID!
const API_KEY = process.env.AIRTABLE_API_KEY!

type Rec = { id: string; fields: Record<string, unknown> }

async function fetchAll(tableId: string, params: URLSearchParams): Promise<Rec[]> {
  const records: Rec[] = []
  let offset: string | undefined
  do {
    const p = new URLSearchParams(params)
    if (offset) p.set('offset', offset)
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${tableId}?${p}`,
      { headers: { Authorization: `Bearer ${API_KEY}` }, cache: 'no-store' },
    )
    if (!res.ok) break
    const data = await res.json() as { records: Rec[]; offset?: string }
    records.push(...data.records)
    offset = data.offset
  } while (offset)
  return records
}

const num = (v: unknown): number => (typeof v === 'number' ? v : 0)
const linkName = (v: unknown): { id: string; name: string } | undefined => {
  if (Array.isArray(v) && v[0] && typeof v[0] === 'object') {
    const e = v[0] as { id?: string; name?: string }
    return { id: e.id ?? '', name: e.name ?? '' }
  }
  return undefined
}

// UAE work week starts Saturday. Returns { weekStart 'YYYY-MM-DD', dayIndex 0=Sat..6=Fri }.
function weekOf(dateStr: string): { weekStart: string; dayIndex: number } | null {
  if (!dateStr) return null
  const d = new Date(`${dateStr}T00:00:00Z`)
  if (isNaN(d.getTime())) return null
  const dayIndex = (d.getUTCDay() + 1) % 7 // Sat→0 … Fri→6
  const start = new Date(d)
  start.setUTCDate(d.getUTCDate() - dayIndex)
  return { weekStart: start.toISOString().slice(0, 10), dayIndex }
}

const DAY_KEYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const

interface Week {
  weekStart: string
  workerName: string
  nickname: string
  project: string
  sat: number; sun: number; mon: number; tue: number; wed: number; thu: number; fri: number
  overtime: number
  approvedAll: boolean
  anyRow: boolean
}

export const GET = requireRole('superadmin')(async (req: NextRequest) => {
  const url = new URL(req.url)
  const month = url.searchParams.get('month') ?? '' // YYYY-MM
  let from = url.searchParams.get('from') ?? ''
  let to   = url.searchParams.get('to')   ?? ''

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number)
    from = `${month}-01`
    to = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
  }

  const tsParams = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  for (const f of [
    PRODUCTION_TIMESHEETS.WORK_DATE, PRODUCTION_TIMESHEETS.WORKER, PRODUCTION_TIMESHEETS.PROJECT,
    PRODUCTION_TIMESHEETS.REGULAR_HOURS, PRODUCTION_TIMESHEETS.OVERTIME_HOURS, PRODUCTION_TIMESHEETS.MANAGER_APPROVED,
  ]) tsParams.append('fields[]', f)
  const dateParts: string[] = []
  if (from) dateParts.push(`IS_AFTER({${PRODUCTION_TIMESHEETS.WORK_DATE}}, "${from}")`)
  if (to)   dateParts.push(`IS_BEFORE({${PRODUCTION_TIMESHEETS.WORK_DATE}}, "${to}")`)
  if (dateParts.length === 1) tsParams.set('filterByFormula', dateParts[0])
  if (dateParts.length === 2) tsParams.set('filterByFormula', `AND(${dateParts.join(',')})`)

  const workerParams = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  workerParams.append('fields[]', WORKERS.NAME)
  workerParams.append('fields[]', WORKERS.FULL_NAME)
  workerParams.append('fields[]', WORKERS.NICKNAME)

  const [entries, workers] = await Promise.all([
    fetchAll(PRODUCTION_TIMESHEETS.TABLE, tsParams),
    fetchAll(WORKERS.TABLE, workerParams),
  ])

  const workerById = new Map(workers.map((w) => [w.id, {
    name:     (w.fields[WORKERS.FULL_NAME] as string) || (w.fields[WORKERS.NAME] as string) || '',
    nickname: (w.fields[WORKERS.NICKNAME] as string) ?? '',
  }]))

  // Aggregate daily rows into weekly grid rows, keyed by worker × week × project.
  const weeks = new Map<string, Week>()
  for (const e of entries) {
    const f = e.fields
    const wk = weekOf((f[PRODUCTION_TIMESHEETS.WORK_DATE] as string) ?? '')
    if (!wk) continue
    const worker = linkName(f[PRODUCTION_TIMESHEETS.WORKER])
    const proj = linkName(f[PRODUCTION_TIMESHEETS.PROJECT])
    const info = worker ? workerById.get(worker.id) : undefined
    const workerName = info?.name || worker?.name || ''
    const projectName = proj?.name ?? ''
    const key = `${worker?.id ?? workerName}|${wk.weekStart}|${projectName}`

    let row = weeks.get(key)
    if (!row) {
      row = {
        weekStart: wk.weekStart, workerName, nickname: info?.nickname ?? '', project: projectName,
        sat: 0, sun: 0, mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, overtime: 0, approvedAll: true, anyRow: false,
      }
      weeks.set(key, row)
    }
    row[DAY_KEYS[wk.dayIndex]] += num(f[PRODUCTION_TIMESHEETS.REGULAR_HOURS])
    row.overtime += num(f[PRODUCTION_TIMESHEETS.OVERTIME_HOURS])
    if (f[PRODUCTION_TIMESHEETS.MANAGER_APPROVED] !== true) row.approvedAll = false
    row.anyRow = true
  }

  const rows = Array.from(weeks.values())
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart) || a.workerName.localeCompare(b.workerName))
    .map((w) => {
      const regularTotal = w.sat + w.sun + w.mon + w.tue + w.wed + w.thu + w.fri
      return {
        weekStart: w.weekStart,
        workerName: w.workerName,
        nickname: w.nickname,
        project: w.project,
        sat: w.sat, sun: w.sun, mon: w.mon, tue: w.tue, wed: w.wed, thu: w.thu, fri: w.fri,
        regularTotal,
        overtime: w.overtime,
        grandTotal: regularTotal + w.overtime,
        approved: w.anyRow && w.approvedAll ? 'Yes' : 'No',
      }
    })

  const buffer = await buildXlsx('Timesheets', [
    { header: 'Week Starting',    key: 'weekStart',    width: 14, isDate: true },
    { header: 'Worker Name',      key: 'workerName',   width: 22 },
    { header: 'Nickname',         key: 'nickname',     width: 16 },
    { header: 'Project',          key: 'project',      width: 24 },
    { header: 'Sat',              key: 'sat',          width: 7 },
    { header: 'Sun',              key: 'sun',          width: 7 },
    { header: 'Mon',              key: 'mon',          width: 7 },
    { header: 'Tue',              key: 'tue',          width: 7 },
    { header: 'Wed',              key: 'wed',          width: 7 },
    { header: 'Thu',              key: 'thu',          width: 7 },
    { header: 'Fri',              key: 'fri',          width: 7 },
    { header: 'Regular Total',    key: 'regularTotal', width: 14 },
    { header: 'Overtime',         key: 'overtime',     width: 12 },
    { header: 'Grand Total',      key: 'grandTotal',   width: 14 },
    { header: 'Manager Approved', key: 'approved',     width: 16 },
  ], rows)

  const filename = month ? `Timesheets_${month}` : 'Production_Timesheets'
  return xlsxResponse(buffer, filename)
}) as (req: NextRequest) => Promise<NextResponse>
