import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { FOLLOW_UP_LOG, PROJECTS } from '@/lib/fieldMap'
import { buildXlsx, xlsxResponse } from '@/lib/xlsxHelper'

export const dynamic = 'force-dynamic'

const BASE_ID = process.env.AIRTABLE_BASE_ID!
const API_KEY = process.env.AIRTABLE_API_KEY!

async function fetchAll<T>(tableId: string, params: URLSearchParams): Promise<T[]> {
  const records: T[] = []
  let offset: string | undefined
  do {
    const p = new URLSearchParams(params)
    if (offset) p.set('offset', offset)
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${tableId}?${p}`,
      { headers: { Authorization: `Bearer ${API_KEY}` }, cache: 'no-store' },
    )
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`)
    const data = (await res.json()) as { records: T[]; offset?: string }
    records.push(...data.records)
    offset = data.offset
  } while (offset)
  return records
}

export const GET = requireRole('superadmin')(async () => {
  const logParams = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  logParams.append('fields[]', FOLLOW_UP_LOG.PROJECT)
  logParams.append('fields[]', FOLLOW_UP_LOG.DATE)
  logParams.append('fields[]', FOLLOW_UP_LOG.METHOD)
  logParams.append('fields[]', FOLLOW_UP_LOG.OUTCOME)
  logParams.append('fields[]', FOLLOW_UP_LOG.NEXT_DATE)
  logParams.append('fields[]', FOLLOW_UP_LOG.LOGGED_BY)
  logParams.append('fields[]', FOLLOW_UP_LOG.NOTES)
  logParams.append('sort[0][field]', FOLLOW_UP_LOG.DATE)
  logParams.append('sort[0][direction]', 'desc')

  const projParams = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  projParams.append('fields[]', PROJECTS.PROJECT_ID)
  projParams.append('fields[]', PROJECTS.PROJECT_NAME)
  projParams.append('fields[]', PROJECTS.NICKNAME)
  projParams.append('fields[]', PROJECTS.CLIENT_NAME)

  const [logs, projects] = await Promise.all([
    fetchAll<{ id: string; fields: Record<string, unknown> }>(FOLLOW_UP_LOG.TABLE, logParams),
    fetchAll<{ id: string; fields: Record<string, unknown> }>(PROJECTS.TABLE_ID, projParams),
  ])

  const projectMap = new Map(
    projects.map((p) => [
      p.id,
      {
        projectRef: (p.fields[PROJECTS.PROJECT_ID] as string) ?? '',
        projectName:
          (p.fields[PROJECTS.NICKNAME] as string) || (p.fields[PROJECTS.PROJECT_NAME] as string) || '',
        clientName: (p.fields[PROJECTS.CLIENT_NAME] as string) ?? '',
      },
    ]),
  )

  const rows = logs.map((r) => {
    const f = r.fields
    const projectIds = Array.isArray(f[FOLLOW_UP_LOG.PROJECT])
      ? (f[FOLLOW_UP_LOG.PROJECT] as string[])
      : []
    const info = projectMap.get(projectIds[0] ?? '')
    return {
      date:          (f[FOLLOW_UP_LOG.DATE] as string) ?? '',
      projectRef:    info?.projectRef ?? '',
      projectName:   info?.projectName ?? '',
      clientName:    info?.clientName ?? '',
      method:        (f[FOLLOW_UP_LOG.METHOD] as string) ?? '',
      outcome:       (f[FOLLOW_UP_LOG.OUTCOME] as string) ?? '',
      nextDate:      (f[FOLLOW_UP_LOG.NEXT_DATE] as string) ?? '',
      // Written by the create route to LOGGED_BY (name); DONE_BY is the legacy empty collaborator.
      doneBy:        (f[FOLLOW_UP_LOG.LOGGED_BY] as string) ?? '',
      notes:         (f[FOLLOW_UP_LOG.NOTES] as string) ?? '',
    }
  })

  const buffer = await buildXlsx('Follow-Ups', [
    { header: 'Follow-Up Date',      key: 'date',        width: 14, isDate: true },
    { header: 'Project Ref',         key: 'projectRef',  width: 14 },
    { header: 'Project',             key: 'projectName', width: 25 },
    { header: 'Client Name',         key: 'clientName',  width: 25 },
    { header: 'Method',              key: 'method',      width: 16 },
    { header: 'Outcome',             key: 'outcome',     width: 30 },
    { header: 'Next Follow-Up Date', key: 'nextDate',    width: 16, isDate: true },
    { header: 'Done By',             key: 'doneBy',      width: 20 },
    { header: 'Notes',               key: 'notes',       width: 40 },
  ], rows)

  return xlsxResponse(buffer, 'SED_Follow_Ups')
}) as () => Promise<NextResponse>
