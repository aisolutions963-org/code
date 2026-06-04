import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { QUOTATIONS, PROJECTS } from '@/lib/fieldMap'
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

export const GET = requireRole('superadmin')(async (req: NextRequest) => {
  const from = new URL(req.url).searchParams.get('from') ?? ''

  const qParams = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  if (from) qParams.set('filterByFormula', encodeURIComponent(`IS_AFTER({${QUOTATIONS.SENT_DATE}}, "${from}")`))
  qParams.append('fields[]', QUOTATIONS.NAME)
  qParams.append('fields[]', QUOTATIONS.PROJECT)
  qParams.append('fields[]', QUOTATIONS.DESCRIPTION)
  qParams.append('fields[]', QUOTATIONS.QUANTITY)
  qParams.append('fields[]', QUOTATIONS.UNIT_PRICE)
  qParams.append('fields[]', QUOTATIONS.QUOTATION_STATUS)
  qParams.append('fields[]', QUOTATIONS.SENT_DATE)

  const projParams = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  projParams.append('fields[]', PROJECTS.PROJECT_ID)
  projParams.append('fields[]', PROJECTS.CLIENT_NAME)

  const [quotations, allProjects] = await Promise.all([
    fetchAll(QUOTATIONS.TABLE_ID, qParams),
    fetchAll(PROJECTS.TABLE_ID, projParams),
  ])

  const projectById = new Map(allProjects.map((p) => [p.id, p.fields]))

  let lineNum = 1
  const rows = quotations.map((q) => {
    const f = q.fields
    const projIds = Array.isArray(f[QUOTATIONS.PROJECT]) ? (f[QUOTATIONS.PROJECT] as string[]) : []
    const proj = projIds[0] ? projectById.get(projIds[0]) : undefined
    const qty = (f[QUOTATIONS.QUANTITY] as number) ?? 0
    const rate = (f[QUOTATIONS.UNIT_PRICE] as number) ?? 0
    const subtotal = qty * rate
    return {
      lineNum: lineNum++,
      projectRef: (proj?.[PROJECTS.PROJECT_ID] as string) ?? '',
      clientName: (proj?.[PROJECTS.CLIENT_NAME] as string) ?? '',
      description: (f[QUOTATIONS.DESCRIPTION] as string) ?? (f[QUOTATIONS.NAME] as string) ?? '',
      qty,
      rate,
      subtotal,
    }
  })

  const buffer = await buildXlsx('Line Items', [
    { header: 'Line #', key: 'lineNum', width: 8 },
    { header: 'Project Ref', key: 'projectRef', width: 14 },
    { header: 'Client Name', key: 'clientName', width: 22 },
    { header: 'Description', key: 'description', width: 32 },
    { header: 'Qty', key: 'qty', width: 8 },
    { header: 'Rate (AED)', key: 'rate', width: 14, isCurrency: true },
    { header: 'Subtotal (AED)', key: 'subtotal', width: 16, isCurrency: true },
  ], rows)

  return xlsxResponse(buffer, 'Quotation_Line_Items')
}) as (req: NextRequest) => Promise<NextResponse>
