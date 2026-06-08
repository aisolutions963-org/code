import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { QUOTATIONS, PROJECTS } from '@/lib/fieldMap'
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
    if (!res.ok) break
    const data = await res.json() as { records: T[]; offset?: string }
    records.push(...data.records)
    offset = data.offset
  } while (offset)
  return records
}

export const GET = requireRole('superadmin')(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams
  const from = sp.get('from') ?? ''
  const to   = sp.get('to')   ?? ''

  const params = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  params.append('fields[]', QUOTATIONS.NAME)
  params.append('fields[]', QUOTATIONS.PROJECT)
  params.append('fields[]', QUOTATIONS.DESCRIPTION)
  params.append('fields[]', QUOTATIONS.QUANTITY)
  params.append('fields[]', QUOTATIONS.UNIT_PRICE)
  params.append('fields[]', QUOTATIONS.QUOTATION_STATUS)
  params.append('fields[]', QUOTATIONS.SENT_DATE)
  params.append('fields[]', QUOTATIONS.APPROVED_DATE)
  params.append('fields[]', QUOTATIONS.RECORDED_BY)
  const dateParts: string[] = []
  if (from) dateParts.push(`IS_AFTER({${QUOTATIONS.SENT_DATE}}, "${from}")`)
  if (to)   dateParts.push(`IS_BEFORE({${QUOTATIONS.SENT_DATE}}, "${to}")`)
  if (dateParts.length === 1) params.set('filterByFormula', encodeURIComponent(dateParts[0]))
  if (dateParts.length === 2) params.set('filterByFormula', encodeURIComponent(`AND(${dateParts.join(',')})`))


  const [quotations, allProjects] = await Promise.all([
    fetchAll<{ id: string; fields: Record<string, unknown> }>(QUOTATIONS.TABLE_ID, params),
    fetchAll<{ id: string; fields: Record<string, unknown> }>(PROJECTS.TABLE_ID, (() => {
      const p = new URLSearchParams({ returnFieldsByFieldId: 'true' })
      p.append('fields[]', PROJECTS.PROJECT_ID)
      p.append('fields[]', PROJECTS.PROJECT_NAME)
      p.append('fields[]', PROJECTS.CLIENT_NAME)
      p.append('fields[]', PROJECTS.PROJECT_STAGE)
      p.append('fields[]', PROJECTS.SALES_OWNER)
      return p
    })()),
  ])

  const projectById = new Map(allProjects.map((p) => [p.id, p.fields]))

  const rows = quotations.map((q) => {
    const f = q.fields
    const projectLinks = Array.isArray(f[QUOTATIONS.PROJECT]) ? (f[QUOTATIONS.PROJECT] as string[]) : []
    const proj = projectLinks[0] ? projectById.get(projectLinks[0]) : undefined
    const rawOwner = proj?.[PROJECTS.SALES_OWNER]
    const ownerEntry = Array.isArray(rawOwner) ? rawOwner[0] : rawOwner
    const owner = (!ownerEntry || typeof ownerEntry === 'string') ? undefined : ownerEntry as { name?: string }
    const qty = (f[QUOTATIONS.QUANTITY] as number) ?? 0
    const price = (f[QUOTATIONS.UNIT_PRICE] as number) ?? 0
    const subtotal = qty * price
    return {
      projectRef: (proj?.[PROJECTS.PROJECT_ID] as string) ?? '',
      clientName: (proj?.[PROJECTS.CLIENT_NAME] as string) ?? '',
      projectDetails: (proj?.[PROJECTS.PROJECT_NAME] as string) ?? '',
      description: (f[QUOTATIONS.DESCRIPTION] as string) ?? '',
      status: (f[QUOTATIONS.QUOTATION_STATUS] as string) ?? '',
      projectStatus: (proj?.[PROJECTS.PROJECT_STAGE] as string) ?? '',
      sales: owner?.name ?? '',
      quoteAmount: subtotal,
      sentDate: (f[QUOTATIONS.SENT_DATE] as string) ?? '',
      approvedDate: (f[QUOTATIONS.APPROVED_DATE] as string) ?? '',
      recordedBy: (f[QUOTATIONS.RECORDED_BY] as string) ?? '',
    }
  })

  const buffer = await buildXlsx('Quotations', [
    { header: 'Project Ref', key: 'projectRef', width: 14 },
    { header: 'Client Name', key: 'clientName', width: 22 },
    { header: 'Project Details', key: 'projectDetails', width: 28 },
    { header: 'Description', key: 'description', width: 30 },
    { header: 'Q. Status', key: 'status', width: 16 },
    { header: 'Project Status', key: 'projectStatus', width: 16 },
    { header: 'Sales', key: 'sales', width: 18 },
    { header: 'Quote Amount (AED)', key: 'quoteAmount', width: 20, isCurrency: true },
    { header: 'Quote Date', key: 'sentDate', width: 14, isDate: true },
    { header: 'Approved Date', key: 'approvedDate', width: 14, isDate: true },
    { header: 'Recorded By', key: 'recordedBy', width: 18 },
  ], rows)

  return xlsxResponse(buffer, 'Quotations_Pipeline')
}) as (req: NextRequest) => Promise<NextResponse>
