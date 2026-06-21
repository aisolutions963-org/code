import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { FOLLOW_UP_LOG, QUOTATIONS, PROJECTS } from '@/lib/fieldMap'
import { buildXlsx, xlsxResponse } from '@/lib/xlsxHelper'

export const dynamic = 'force-dynamic'

const BASE_ID = process.env.AIRTABLE_BASE_ID!
const API_KEY = process.env.AIRTABLE_API_KEY!

async function fetchAll(tableId: string, params: URLSearchParams) {
  const records: { id: string; fields: Record<string, unknown> }[] = []
  let offset: string | undefined
  do {
    const p = new URLSearchParams(params)
    if (offset) p.set('offset', offset)
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${tableId}?${p}`,
      { headers: { Authorization: `Bearer ${API_KEY}` }, cache: 'no-store' },
    )
    if (!res.ok) break
    const data = await res.json() as { records: typeof records; offset?: string }
    records.push(...data.records)
    offset = data.offset
  } while (offset)
  return records
}

function collaboratorName(v: unknown): string {
  if (!v || typeof v !== 'object') return ''
  return (v as { name?: string }).name ?? ''
}

function selectName(v: unknown): string {
  if (!v) return ''
  if (typeof v === 'object' && v !== null && 'name' in v) return (v as { name: string }).name
  return ''
}

export const GET = requireRole('superadmin')(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams
  const from = sp.get('from') ?? ''
  const to   = sp.get('to')   ?? ''

  const params = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  params.append('fields[]', FOLLOW_UP_LOG.FOLLOW_UP_NAME)
  params.append('fields[]', FOLLOW_UP_LOG.FOLLOW_UP_DATE)
  params.append('fields[]', FOLLOW_UP_LOG.FOLLOW_UP_METHOD)
  params.append('fields[]', FOLLOW_UP_LOG.OUTCOME)
  params.append('fields[]', FOLLOW_UP_LOG.NEXT_FOLLOW_UP_DATE)
  params.append('fields[]', FOLLOW_UP_LOG.DONE_BY)
  params.append('fields[]', FOLLOW_UP_LOG.FOLLOW_UP_NOTES)
  params.append('fields[]', FOLLOW_UP_LOG.STATUS)
  params.append('fields[]', FOLLOW_UP_LOG.QUOTATION)

  const dateParts: string[] = []
  if (from) dateParts.push(`IS_AFTER({${FOLLOW_UP_LOG.FOLLOW_UP_DATE}}, "${from}")`)
  if (to)   dateParts.push(`IS_BEFORE({${FOLLOW_UP_LOG.FOLLOW_UP_DATE}}, "${to}")`)
  if (dateParts.length === 1) params.set('filterByFormula', encodeURIComponent(dateParts[0]))
  if (dateParts.length === 2) params.set('filterByFormula', encodeURIComponent(`AND(${dateParts.join(',')})`))

  params.set('sort[0][field]', FOLLOW_UP_LOG.FOLLOW_UP_DATE)
  params.set('sort[0][direction]', 'desc')

  // Fetch quotations to resolve client name and project link
  const quotParams = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  quotParams.append('fields[]', QUOTATIONS.CLIENT_NAME)
  quotParams.append('fields[]', QUOTATIONS.PROJECT)

  const projParams = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  projParams.append('fields[]', PROJECTS.PROJECT_ID)
  projParams.append('fields[]', PROJECTS.PROJECT_NAME)

  const [records, allQuotations, allProjects] = await Promise.all([
    fetchAll(FOLLOW_UP_LOG.TABLE_ID, params),
    fetchAll(QUOTATIONS.TABLE_ID, quotParams),
    fetchAll(PROJECTS.TABLE_ID, projParams),
  ])

  const quotationById = new Map(allQuotations.map((q) => [q.id, q.fields]))
  const projectById   = new Map(allProjects.map((p)   => [p.id, p.fields]))

  const rows = records.map((r) => {
    const f = r.fields
    const quotIds = Array.isArray(f[FOLLOW_UP_LOG.QUOTATION]) ? (f[FOLLOW_UP_LOG.QUOTATION] as string[]) : []
    const quot = quotIds[0] ? quotationById.get(quotIds[0]) : undefined
    const projIds = quot ? (Array.isArray(quot[QUOTATIONS.PROJECT]) ? (quot[QUOTATIONS.PROJECT] as string[]) : []) : []
    const proj = projIds[0] ? projectById.get(projIds[0]) : undefined

    return {
      followUpName:     (f[FOLLOW_UP_LOG.FOLLOW_UP_NAME] as string) ?? '',
      followUpDate:     (f[FOLLOW_UP_LOG.FOLLOW_UP_DATE] as string) ?? '',
      client:           (quot?.[QUOTATIONS.CLIENT_NAME] as string) ?? '',
      project:          (proj?.[PROJECTS.PROJECT_NAME] as string) ?? '',
      projectRef:       (proj?.[PROJECTS.PROJECT_ID] as string) ?? '',
      method:           selectName(f[FOLLOW_UP_LOG.FOLLOW_UP_METHOD]),
      outcome:          selectName(f[FOLLOW_UP_LOG.OUTCOME]),
      nextFollowUp:     (f[FOLLOW_UP_LOG.NEXT_FOLLOW_UP_DATE] as string) ?? '',
      doneBy:           collaboratorName(f[FOLLOW_UP_LOG.DONE_BY]),
      notes:            (f[FOLLOW_UP_LOG.FOLLOW_UP_NOTES] as string) ?? '',
    }
  })

  const buffer = await buildXlsx('Follow-Ups', [
    { header: 'Follow-Up Name',     key: 'followUpName', width: 24 },
    { header: 'Date',               key: 'followUpDate', width: 14, isDate: true },
    { header: 'Client',             key: 'client',       width: 22 },
    { header: 'Project',            key: 'project',      width: 26 },
    { header: 'Project Ref',        key: 'projectRef',   width: 14 },
    { header: 'Method',             key: 'method',       width: 18 },
    { header: 'Outcome',            key: 'outcome',      width: 24 },
    { header: 'Next Follow-Up',     key: 'nextFollowUp', width: 16, isDate: true },
    { header: 'Done By',            key: 'doneBy',       width: 20 },
    { header: 'Notes',              key: 'notes',        width: 36 },
  ], rows)

  return xlsxResponse(buffer, 'SED_Follow_Ups')
}) as (req: NextRequest) => Promise<NextResponse>
