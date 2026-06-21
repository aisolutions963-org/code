import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { PAYABLES, PROJECTS } from '@/lib/fieldMap'
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
  params.append('fields[]', PAYABLES.PAYABLE_NAME)
  params.append('fields[]', PAYABLES.PAYABLE_TO)
  params.append('fields[]', PAYABLES.LINKED_PROJECT)
  params.append('fields[]', PAYABLES.CATEGORY)
  params.append('fields[]', PAYABLES.INVOICE_NUMBER)
  params.append('fields[]', PAYABLES.INVOICE_DATE)
  params.append('fields[]', PAYABLES.DUE_DATE)
  params.append('fields[]', PAYABLES.TOTAL_AMOUNT)
  params.append('fields[]', PAYABLES.AMOUNT_PAID)
  params.append('fields[]', PAYABLES.AMOUNT_PAYABLE)
  params.append('fields[]', PAYABLES.PAYMENT_STATUS)
  params.append('fields[]', PAYABLES.APPROVED_BY)
  params.append('fields[]', PAYABLES.NOTES)

  const dateParts: string[] = []
  if (from) dateParts.push(`IS_AFTER({${PAYABLES.INVOICE_DATE}}, "${from}")`)
  if (to)   dateParts.push(`IS_BEFORE({${PAYABLES.INVOICE_DATE}}, "${to}")`)
  if (dateParts.length === 1) params.set('filterByFormula', encodeURIComponent(dateParts[0]))
  if (dateParts.length === 2) params.set('filterByFormula', encodeURIComponent(`AND(${dateParts.join(',')})`))

  const projParams = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  projParams.append('fields[]', PROJECTS.PROJECT_ID)
  projParams.append('fields[]', PROJECTS.PROJECT_NAME)

  const [records, allProjects] = await Promise.all([
    fetchAll(PAYABLES.TABLE_ID, params),
    fetchAll(PROJECTS.TABLE_ID, projParams),
  ])

  const projectById = new Map(allProjects.map((p) => [p.id, p.fields]))

  const rows = records.map((r) => {
    const f = r.fields
    const projIds = Array.isArray(f[PAYABLES.LINKED_PROJECT]) ? (f[PAYABLES.LINKED_PROJECT] as string[]) : []
    const proj = projIds[0] ? projectById.get(projIds[0]) : undefined
    const approvedBy = f[PAYABLES.APPROVED_BY]
    const approvedName = approvedBy && typeof approvedBy === 'object' && 'name' in approvedBy
      ? (approvedBy as { name: string }).name
      : ''
    return {
      payableName: (f[PAYABLES.PAYABLE_NAME] as string) ?? '',
      payableTo:   (f[PAYABLES.PAYABLE_TO] as string) ?? '',
      project:     (proj?.[PROJECTS.PROJECT_NAME] as string) ?? '',
      projectRef:  (proj?.[PROJECTS.PROJECT_ID] as string) ?? '',
      category:    selectName(f[PAYABLES.CATEGORY]),
      invoiceNum:  (f[PAYABLES.INVOICE_NUMBER] as string) ?? '',
      invoiceDate: (f[PAYABLES.INVOICE_DATE] as string) ?? '',
      dueDate:     (f[PAYABLES.DUE_DATE] as string) ?? '',
      total:       (f[PAYABLES.TOTAL_AMOUNT] as number) ?? 0,
      paid:        (f[PAYABLES.AMOUNT_PAID] as number) ?? 0,
      payable:     (f[PAYABLES.AMOUNT_PAYABLE] as number) ?? 0,
      status:      selectName(f[PAYABLES.PAYMENT_STATUS]),
      approvedBy:  approvedName,
      notes:       (f[PAYABLES.NOTES] as string) ?? '',
    }
  })

  const buffer = await buildXlsx('Payables', [
    { header: 'Payable Name',      key: 'payableName', width: 28 },
    { header: 'Payable To',        key: 'payableTo',   width: 22 },
    { header: 'Project',           key: 'project',     width: 26 },
    { header: 'Project Ref',       key: 'projectRef',  width: 14 },
    { header: 'Category',          key: 'category',    width: 18 },
    { header: 'Invoice #',         key: 'invoiceNum',  width: 16 },
    { header: 'Invoice Date',      key: 'invoiceDate', width: 14, isDate: true },
    { header: 'Due Date',          key: 'dueDate',     width: 14, isDate: true },
    { header: 'Total (AED)',       key: 'total',       width: 16, isCurrency: true },
    { header: 'Paid (AED)',        key: 'paid',        width: 14, isCurrency: true },
    { header: 'Payable (AED)',     key: 'payable',     width: 14, isCurrency: true },
    { header: 'Payment Status',    key: 'status',      width: 16 },
    { header: 'Approved By',       key: 'approvedBy',  width: 18 },
    { header: 'Notes',             key: 'notes',       width: 30 },
  ], rows)

  return xlsxResponse(buffer, 'Payables')
}) as (req: NextRequest) => Promise<NextResponse>
