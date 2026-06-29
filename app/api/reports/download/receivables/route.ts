import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { RECEIVABLES } from '@/lib/fieldMap'
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
  params.append('fields[]', RECEIVABLES.CLIENT_COMPANY)
  params.append('fields[]', RECEIVABLES.INVOICE_REF)
  params.append('fields[]', RECEIVABLES.ORIGINAL_AMOUNT)
  params.append('fields[]', RECEIVABLES.COLLECTED)
  params.append('fields[]', RECEIVABLES.BALANCE_DUE)
  params.append('fields[]', RECEIVABLES.INVOICE_DATE)
  params.append('fields[]', RECEIVABLES.LAST_CONTACT)
  params.append('fields[]', RECEIVABLES.AGREED_DATE)
  params.append('fields[]', RECEIVABLES.DEBT_AGE)
  params.append('fields[]', RECEIVABLES.DEBT_STATUS)
  params.append('fields[]', RECEIVABLES.NOTES)
  params.append('sort[0][field]', RECEIVABLES.INVOICE_DATE)
  params.append('sort[0][direction]', 'asc')

  const records = await fetchAll<{ id: string; fields: Record<string, unknown> }>(RECEIVABLES.TABLE, params)

  const rows = records.map((r) => {
    const f = r.fields
    return {
      clientCompany:  (f[RECEIVABLES.CLIENT_COMPANY] as string) ?? '',
      invoiceRef:     (f[RECEIVABLES.INVOICE_REF] as string) ?? '',
      originalAmount: typeof f[RECEIVABLES.ORIGINAL_AMOUNT] === 'number' ? (f[RECEIVABLES.ORIGINAL_AMOUNT] as number) : 0,
      collected:      typeof f[RECEIVABLES.COLLECTED] === 'number' ? (f[RECEIVABLES.COLLECTED] as number) : 0,
      balanceDue:     typeof f[RECEIVABLES.BALANCE_DUE] === 'number' ? (f[RECEIVABLES.BALANCE_DUE] as number) : 0,
      invoiceDate:    (f[RECEIVABLES.INVOICE_DATE] as string) ?? '',
      lastContact:    (f[RECEIVABLES.LAST_CONTACT] as string) ?? '',
      agreedDate:     (f[RECEIVABLES.AGREED_DATE] as string) ?? '',
      debtAge:        typeof f[RECEIVABLES.DEBT_AGE] === 'number' ? (f[RECEIVABLES.DEBT_AGE] as number) : '',
      debtStatus:     (f[RECEIVABLES.DEBT_STATUS] as string) ?? '',
      notes:          (f[RECEIVABLES.NOTES] as string) ?? '',
    }
  })

  const buffer = await buildXlsx('Receivables', [
    { header: 'Client / Company',   key: 'clientCompany',  width: 25 },
    { header: 'Invoice Ref',        key: 'invoiceRef',     width: 16 },
    { header: 'Original (AED)',     key: 'originalAmount', width: 16, isCurrency: true },
    { header: 'Collected (AED)',    key: 'collected',      width: 16, isCurrency: true },
    { header: 'Balance Due (AED)',  key: 'balanceDue',     width: 16, isCurrency: true },
    { header: 'Invoice Date',       key: 'invoiceDate',    width: 14, isDate: true },
    { header: 'Last Contact',       key: 'lastContact',    width: 14, isDate: true },
    { header: 'Agreed Date',        key: 'agreedDate',     width: 14, isDate: true },
    { header: 'Debt Age (days)',    key: 'debtAge',        width: 14 },
    { header: 'Status',             key: 'debtStatus',     width: 14 },
    { header: 'Notes',              key: 'notes',          width: 35 },
  ], rows)

  return xlsxResponse(buffer, 'Receivables')
}) as () => Promise<NextResponse>
