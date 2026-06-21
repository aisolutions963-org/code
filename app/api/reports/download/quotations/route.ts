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

function collaboratorName(v: unknown): string {
  if (!v || typeof v !== 'object') return ''
  return (v as { name?: string }).name ?? ''
}

export const GET = requireRole('superadmin')(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams
  const from = sp.get('from') ?? ''
  const to   = sp.get('to')   ?? ''

  const params = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  params.append('fields[]', QUOTATIONS.NAME)
  params.append('fields[]', QUOTATIONS.CLIENT_NAME)
  params.append('fields[]', QUOTATIONS.PROJECT)
  params.append('fields[]', QUOTATIONS.DESCRIPTION)
  params.append('fields[]', QUOTATIONS.QUOTATION_STATUS)
  params.append('fields[]', QUOTATIONS.SENT_DATE)
  params.append('fields[]', QUOTATIONS.APPROVED_DATE)
  params.append('fields[]', QUOTATIONS.RECORDED_BY)
  params.append('fields[]', QUOTATIONS.QUOTE_AMOUNT)
  params.append('fields[]', QUOTATIONS.VAT_AMOUNT)
  params.append('fields[]', QUOTATIONS.TOTAL_WITH_VAT)
  params.append('fields[]', QUOTATIONS.VARIATION_1)
  params.append('fields[]', QUOTATIONS.VARIATION_2)
  params.append('fields[]', QUOTATIONS.TOTAL_WITH_VARS)
  params.append('fields[]', QUOTATIONS.NEXT_FOLLOWUP)
  params.append('fields[]', QUOTATIONS.SALES)
  params.append('fields[]', QUOTATIONS.REVISION)

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
      return p
    })()),
  ])

  const projectById = new Map(allProjects.map((p) => [p.id, p.fields]))

  const rows = quotations.map((q) => {
    const f = q.fields
    const projectLinks = Array.isArray(f[QUOTATIONS.PROJECT]) ? (f[QUOTATIONS.PROJECT] as string[]) : []
    const proj = projectLinks[0] ? projectById.get(projectLinks[0]) : undefined

    return {
      projectRef:    (proj?.[PROJECTS.PROJECT_ID] as string) ?? '',
      clientName:    (f[QUOTATIONS.CLIENT_NAME] as string) ?? (proj?.[PROJECTS.CLIENT_NAME] as string) ?? '',
      projectName:   (proj?.[PROJECTS.PROJECT_NAME] as string) ?? '',
      description:   (f[QUOTATIONS.DESCRIPTION] as string) ?? '',
      status:        (f[QUOTATIONS.QUOTATION_STATUS] as string) ?? '',
      projectStatus: (proj?.[PROJECTS.PROJECT_STAGE] as string) ?? '',
      revision:      (f[QUOTATIONS.REVISION] as string) ?? '',
      sales:         collaboratorName(f[QUOTATIONS.SALES]),
      quoteAmount:   (f[QUOTATIONS.QUOTE_AMOUNT] as number) ?? 0,
      vatAmount:     (f[QUOTATIONS.VAT_AMOUNT] as number) ?? 0,
      totalWithVat:  (f[QUOTATIONS.TOTAL_WITH_VAT] as number) ?? 0,
      variation1:    (f[QUOTATIONS.VARIATION_1] as number) ?? 0,
      variation2:    (f[QUOTATIONS.VARIATION_2] as number) ?? 0,
      totalWithVars: (f[QUOTATIONS.TOTAL_WITH_VARS] as number) ?? 0,
      sentDate:      (f[QUOTATIONS.SENT_DATE] as string) ?? '',
      approvedDate:  (f[QUOTATIONS.APPROVED_DATE] as string) ?? '',
      nextFollowUp:  (f[QUOTATIONS.NEXT_FOLLOWUP] as string) ?? '',
      recordedBy:    (f[QUOTATIONS.RECORDED_BY] as string) ?? '',
    }
  })

  const buffer = await buildXlsx('Quotations', [
    { header: 'Project Ref',            key: 'projectRef',    width: 14 },
    { header: 'Client Name',            key: 'clientName',    width: 22 },
    { header: 'Project Name',           key: 'projectName',   width: 28 },
    { header: 'Description',            key: 'description',   width: 30 },
    { header: 'Q. Status',              key: 'status',        width: 16 },
    { header: 'Project Status',         key: 'projectStatus', width: 16 },
    { header: 'Revision',               key: 'revision',      width: 10 },
    { header: 'Sales',                  key: 'sales',         width: 18 },
    { header: 'Quote Amount (AED)',      key: 'quoteAmount',   width: 20, isCurrency: true },
    { header: 'VAT Amount (AED)',        key: 'vatAmount',     width: 18, isCurrency: true },
    { header: 'Total incl. VAT (AED)',   key: 'totalWithVat',  width: 20, isCurrency: true },
    { header: 'Variation 1 (AED)',       key: 'variation1',    width: 18, isCurrency: true },
    { header: 'Variation 2 (AED)',       key: 'variation2',    width: 18, isCurrency: true },
    { header: 'Total with Vars (AED)',   key: 'totalWithVars', width: 20, isCurrency: true },
    { header: 'Sent Date',              key: 'sentDate',      width: 14, isDate: true },
    { header: 'Approved Date',          key: 'approvedDate',  width: 14, isDate: true },
    { header: 'Next Follow-Up',         key: 'nextFollowUp',  width: 16, isDate: true },
    { header: 'Recorded By',            key: 'recordedBy',    width: 18 },
  ], rows)

  return xlsxResponse(buffer, 'Quotations_Pipeline')
}) as (req: NextRequest) => Promise<NextResponse>
