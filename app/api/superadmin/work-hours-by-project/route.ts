import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getTimesheetEntries } from '@/lib/airtable'
import { PROJECTS, PRODUCTION_TIMESHEETS } from '@/lib/fieldMap'

export const dynamic = 'force-dynamic'

const BASE_ID = process.env.AIRTABLE_BASE_ID!
const API_KEY = process.env.AIRTABLE_API_KEY!

async function fetchProjectNames(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  let offset: string | undefined
  do {
    const params = new URLSearchParams({ returnFieldsByFieldId: 'true' })
    params.append('fields[]', PROJECTS.PROJECT_ID)
    params.append('fields[]', PROJECTS.PROJECT_NAME)
    if (offset) params.set('offset', offset)
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${PROJECTS.TABLE_ID}?${params}`,
      { headers: { Authorization: `Bearer ${API_KEY}` }, cache: 'no-store' },
    )
    if (!res.ok) break
    const data = await res.json() as {
      records: { id: string; fields: Record<string, unknown> }[]
      offset?: string
    }
    for (const r of data.records) {
      const ref  = r.fields[PROJECTS.PROJECT_ID] as string | undefined
      const name = r.fields[PROJECTS.PROJECT_NAME] as string | undefined
      if (ref || name) map.set(r.id, name ? `${ref ?? ''}${ref && name ? ' — ' : ''}${name}` : (ref ?? r.id))
    }
    offset = data.offset
  } while (offset)
  return map
}

export const GET = requireRole('superadmin')(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams
  const month = sp.get('month') ?? ''  // YYYY-MM
  const from  = sp.get('from')  ?? undefined
  const to    = sp.get('to')    ?? undefined

  let dateFrom = from
  let dateTo   = to

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number)
    dateFrom = `${month}-01`
    const lastDay = new Date(y, m, 0).getDate()
    dateTo = `${month}-${String(lastDay).padStart(2, '0')}`
  }

  const [entries, projectNames] = await Promise.all([
    getTimesheetEntries({ from: dateFrom, to: dateTo }),
    fetchProjectNames(),
  ])

  // Group total hours by project record ID
  const hoursMap = new Map<string, number>()
  for (const e of entries) {
    for (const projId of e.projectIds) {
      hoursMap.set(projId, (hoursMap.get(projId) ?? 0) + e.totalHours)
    }
  }

  const data = Array.from(hoursMap.entries())
    .map(([id, hours]) => ({
      project: projectNames.get(id) ?? id,
      hours: Math.round(hours * 10) / 10,
    }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 15) // top 15 projects

  return NextResponse.json({ data })
}) as (req: NextRequest) => Promise<NextResponse>
