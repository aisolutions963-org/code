import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { RECEIVABLES, PROJECTS } from '@/lib/fieldMap'
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
  params.append('fields[]', RECEIVABLES.RECEIVABLE_NAME)
  params.append('fields[]', RECEIVABLES.CLIENT_COMPANY)
  params.append('fields[]', RECEIVABLES.LINKED_PROJECT)
  params.append('fields[]', RECEIVABLES.INVOICE_REFERENCE)
  params.append('fields[]', RECEIVABLES.ORIGINAL_AMOUNT)
  params.append('fields[]', RECEIVABLES.AMOUNT_COLLECTED)
  params.append('fields[]', RECEIVABLES.BALANCE_DUE)
  params.append('fields[]', RECEIVABLES.INVOICE_DATE)
  params.append('fields[]', RECEIVABLES.LAST_PAYMENT_DATE)
  params.append('fields[]', RECEIVABLES.LAST_CONTACT_DATE)
  params.append('fields[]', RECEIVABLES.AGREED_PAYMENT_DATE)
  params.append('fields[]', RECEIVABLES.DEBT_AGE_DAYS)
  params.append('fields[]', RECEIVABLES.DEBT_STATUS)
  params.append('fields[]', RECEIVABLES.NOTES)

  const dateParts: string[] = []
  if (from) dateParts.push(`IS_AFTER({${RECEIVABLES.INVOICE_DATE}}, "${from}")`)
  if (to)   dateParts.push(`IS_BEFORE({${RECEIVABLES.INVOICE_DATE}}, "${to}")`)
  if (dateParts.length === 1) params.set('filterByFormula', encodeURIComponent(dateParts[0]))
  if (dateParts.length === 2) params.set('filterByFormula', encodeURIComponent(`AND(${dateParts.join(',')})`))

  const projParams = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  projParams.append('fields[]', PROJECTS.PROJECT_ID)
  projParams.append('fields[]', PROJECTS.PROJECT_NAME)

  const [records, allProjects] = await Promise.all([
    fetchAll(RECEIVABLES.TABLE_ID, params),
    fetchAll(PROJECTS.TABLE_ID, projParams),
  ])

  const projectById = new Map(allProjects.map((p) => [p.id, p.fields]))

  const rows = records.map((r) => {
    const f = r.fields
    const projIds = Array.isArray(f[RECEIVABLES.LINKED_PROJECT]) ? (f[RECEIVABLES.LINKED_PROJECT] as string[]) : []
    const proj = projIds[0] ? projectById.get(projIds[0]) : undefined
    return {
      receivableName:     (f[RECEIVABLES.RECEIVABLE_NAME] as string) ?? '',
      client:             (f[RECEIVABLES.CLIENT_COMPANY] as string) ?? '',
      project:            (proj?.[PROJECTS.PROJECT_NAME] as string) ?? '',
      projectRef:         (proj?.[PROJECTS.PROJECT_ID] as string) ?? '',
      invoiceRef:         (f[RECEIVABLES.INVOICE_REFERENCE] as string) ?? '',
      original:           (f[RECEIVABLES.ORIGINAL_AMOUNT] as number) ?? 0,
      collected:          (f[RECEIVABLES.AMOUNT_COLLECTED] as number) ?? 0,
      balance:            (f[RECEIVABLES.BALANCE_DUE] as number) ?? 0,
      invoiceDate:        (f[RECEIVABLES.INVOICE_DATE] as string) ?? '',
      lastPayment:        (f[RECEIVABLES.LAST_PAYMENT_DATE] as string) ?? '',
      lastContact:        (f[RECEIVABLES.LAST_CONTACT_DATE] as string) ?? '',
      agreedPayment:      (f[RECEIVABLES.AGREED_PAYMENT_DATE] as string) ?? '',
      debtAge:            (f[RECEIVABLES.DEBT_AGE_DAYS] as number) ?? 0,
      debtStatus:         selectName(f[RECEIVABLES.DEBT_STATUS]),
      notes:              (f[RECEIVABLES.NOTES] as string) ?? '',
    }
  })

  const buffer = await buildXlsx('Receivables', [
    { header: 'Receivable Name',      key: 'receivableName', width: 24 },
    { header: 'Client / Company',     key: 'client',         width: 22 },
    { header: 'Project',              key: 'project',        width: 26 },
    { header: 'Project Ref',          key: 'projectRef',     width: 14 },
    { header: 'Invoice Ref',          key: 'invoiceRef',     width: 16 },
    { header: 'Original (AED)',       key: 'original',       width: 16, isCurrency: true },
    { header: 'Collected (AED)',      key: 'collected',      width: 16, isCurrency: true },
    { header: 'Balance Due (AED)',    key: 'balance',        width: 16, isCurrency: true },
    { header: 'Invoice Date',         key: 'invoiceDate',    width: 14, isDate: true },
    { header: 'Last Payment Date',    key: 'lastPayment',    width: 16, isDate: true },
    { header: 'Last Contact Date',    key: 'lastContact',    width: 16, isDate: true },
    { header: 'Agreed Payment Date',  key: 'agreedPayment',  width: 18, isDate: true },
    { header: 'Debt Age (Days)',      key: 'debtAge',        width: 14 },
    { header: 'Debt Status',          key: 'debtStatus',     width: 16 },
    { header: 'Notes',                key: 'notes',          width: 28 },
  ], rows)

  return xlsxResponse(buffer, 'Receivables')
}) as (req: NextRequest) => Promise<NextResponse>
