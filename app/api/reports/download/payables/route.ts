import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { PAYABLES } from '@/lib/fieldMap'
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
    const data = (await res.json()) as { records: T[]; offset?: string }
    records.push(...data.records)
    offset = data.offset
  } while (offset)
  return records
}

export const GET = requireRole('superadmin')(async () => {
  const params = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  params.append('fields[]', PAYABLES.PAYABLE_NAME)
  params.append('fields[]', PAYABLES.PAYABLE_TO)
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
  params.append('sort[0][field]', PAYABLES.DUE_DATE)
  params.append('sort[0][direction]', 'asc')

  const records = await fetchAll<{ id: string; fields: Record<string, unknown> }>(PAYABLES.TABLE, params)

  const rows = records.map((r) => {
    const f = r.fields
    return {
      payableName:   (f[PAYABLES.PAYABLE_NAME] as string) ?? '',
      payableTo:     (f[PAYABLES.PAYABLE_TO] as string) ?? '',
      category:      (f[PAYABLES.CATEGORY] as string) ?? '',
      invoiceNumber: (f[PAYABLES.INVOICE_NUMBER] as string) ?? '',
      invoiceDate:   (f[PAYABLES.INVOICE_DATE] as string) ?? '',
      dueDate:       (f[PAYABLES.DUE_DATE] as string) ?? '',
      totalAmount:   typeof f[PAYABLES.TOTAL_AMOUNT] === 'number' ? (f[PAYABLES.TOTAL_AMOUNT] as number) : 0,
      amountPaid:    typeof f[PAYABLES.AMOUNT_PAID] === 'number' ? (f[PAYABLES.AMOUNT_PAID] as number) : 0,
      amountPayable: typeof f[PAYABLES.AMOUNT_PAYABLE] === 'number' ? (f[PAYABLES.AMOUNT_PAYABLE] as number) : 0,
      paymentStatus: (f[PAYABLES.PAYMENT_STATUS] as string) ?? '',
      approvedBy:    (f[PAYABLES.APPROVED_BY] as string) ?? '',
      notes:         (f[PAYABLES.NOTES] as string) ?? '',
    }
  })

  const buffer = await buildXlsx('Payables', [
    { header: 'Payable Name',       key: 'payableName',   width: 25 },
    { header: 'Payable To',         key: 'payableTo',     width: 25 },
    { header: 'Category',           key: 'category',      width: 18 },
    { header: 'Invoice #',          key: 'invoiceNumber', width: 16 },
    { header: 'Invoice Date',       key: 'invoiceDate',   width: 14, isDate: true },
    { header: 'Due Date',           key: 'dueDate',       width: 14, isDate: true },
    { header: 'Total (AED)',        key: 'totalAmount',   width: 16, isCurrency: true },
    { header: 'Paid (AED)',         key: 'amountPaid',    width: 14, isCurrency: true },
    { header: 'Payable (AED)',      key: 'amountPayable', width: 14, isCurrency: true },
    { header: 'Status',             key: 'paymentStatus', width: 14 },
    { header: 'Approved By',        key: 'approvedBy',    width: 18 },
    { header: 'Notes',              key: 'notes',         width: 35 },
  ], rows)

  return xlsxResponse(buffer, 'Payables')
}) as () => Promise<NextResponse>
