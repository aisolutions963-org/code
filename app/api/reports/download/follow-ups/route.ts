import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { TASKS } from '@/lib/fieldMap'
import { buildXlsx, xlsxResponse } from '@/lib/xlsxHelper'

export const dynamic = 'force-dynamic'

const BASE_ID = process.env.AIRTABLE_BASE_ID!
const API_KEY = process.env.AIRTABLE_API_KEY!

export const GET = requireRole('superadmin')(async (req: NextRequest) => {
  const from = new URL(req.url).searchParams.get('from') ?? ''

  const filterParts = [`{${TASKS.TASK_NAME}}="Follow Up"`]
  if (from) filterParts.push(`IS_AFTER({${TASKS.COMPLETION_DATE}}, "${from}")`)
  const formula = filterParts.length > 1 ? `AND(${filterParts.join(',')})` : filterParts[0]

  const params = new URLSearchParams({
    returnFieldsByFieldId: 'true',
    filterByFormula: encodeURIComponent(formula),
  })
  params.append('fields[]', TASKS.TASK_NAME)
  params.append('fields[]', TASKS.STATUS)
  params.append('fields[]', TASKS.FOLLOW_UP_OUTCOME)
  params.append('fields[]', TASKS.COMPLETION_DATE)
  params.append('fields[]', TASKS.ASSIGNED_TO)
  params.append('fields[]', TASKS.PROJECT_ID)

  const records: { id: string; fields: Record<string, unknown> }[] = []
  let offset: string | undefined
  do {
    const p = new URLSearchParams(params)
    if (offset) p.set('offset', offset)
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${TASKS.TABLE_ID}?${p}`,
      { headers: { Authorization: `Bearer ${API_KEY}` }, cache: 'no-store' },
    )
    if (!res.ok) break
    const data = await res.json() as { records: typeof records; offset?: string }
    records.push(...data.records)
    offset = data.offset
  } while (offset)

  const rows = records.map((r) => {
    const f = r.fields
    const assignees = Array.isArray(f[TASKS.ASSIGNED_TO]) ? (f[TASKS.ASSIGNED_TO] as string[]) : []
    return {
      followUpDate: (f[TASKS.COMPLETION_DATE] as string) ?? '',
      projectRef: (f[TASKS.PROJECT_ID] as string) ?? '',
      outcome: (f[TASKS.FOLLOW_UP_OUTCOME] as string) ?? '',
      status: (f[TASKS.STATUS] as string) ?? '',
      doneBy: assignees.join(', '),
    }
  })

  const buffer = await buildXlsx('Follow-Ups', [
    { header: 'Follow-Up Date', key: 'followUpDate', width: 16, isDate: true },
    { header: 'Project Ref', key: 'projectRef', width: 14 },
    { header: 'Outcome', key: 'outcome', width: 28 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Done By', key: 'doneBy', width: 20 },
  ], rows)

  return xlsxResponse(buffer, 'SED_Follow_Ups')
}) as (req: NextRequest) => Promise<NextResponse>
