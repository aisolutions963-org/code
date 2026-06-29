import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { PAYABLES } from '@/lib/fieldMap'

export const dynamic = 'force-dynamic'

const BASE_ID = process.env.AIRTABLE_BASE_ID!
const API_KEY = process.env.AIRTABLE_API_KEY!
const BASE_URL = `https://api.airtable.com/v0/${BASE_ID}`

function authHeader() {
  return { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' }
}

interface RawRecord {
  id: string
  fields: Record<string, unknown>
}

export const GET = requireRole('manager', 'superadmin')(async () => {
  const payables: unknown[] = []
  let offset: string | undefined
  do {
    const params = new URLSearchParams({ returnFieldsByFieldId: 'true' })
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
    if (offset) params.set('offset', offset)
    const res = await fetch(`${BASE_URL}/${PAYABLES.TABLE}?${params}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch payables' }, { status: 500 })
    }
    const data = (await res.json()) as { records: RawRecord[]; offset?: string }
    for (const r of data.records) {
      const f = r.fields
      payables.push({
        id: r.id,
        payableTo: (f[PAYABLES.PAYABLE_TO] as string) ?? '',
        category: (f[PAYABLES.CATEGORY] as string) ?? '',
        invoiceNumber: (f[PAYABLES.INVOICE_NUMBER] as string) ?? '',
        invoiceDate: (f[PAYABLES.INVOICE_DATE] as string) ?? '',
        dueDate: (f[PAYABLES.DUE_DATE] as string) ?? '',
        totalAmount: typeof f[PAYABLES.TOTAL_AMOUNT] === 'number' ? (f[PAYABLES.TOTAL_AMOUNT] as number) : 0,
        amountPaid: typeof f[PAYABLES.AMOUNT_PAID] === 'number' ? (f[PAYABLES.AMOUNT_PAID] as number) : 0,
        amountPayable: typeof f[PAYABLES.AMOUNT_PAYABLE] === 'number' ? (f[PAYABLES.AMOUNT_PAYABLE] as number) : 0,
        paymentStatus: (f[PAYABLES.PAYMENT_STATUS] as string) ?? '',
        approvedBy: (f[PAYABLES.APPROVED_BY] as string) ?? '',
        notes: (f[PAYABLES.NOTES] as string) ?? '',
      })
    }
    offset = data.offset
  } while (offset)
  return NextResponse.json({ payables })
})

export const POST = requireRole('manager', 'superadmin')(async (req: NextRequest) => {
  const body = (await req.json()) as {
    payableTo: string
    category?: string
    invoiceNumber?: string
    invoiceDate?: string
    dueDate?: string
    totalAmount: number
    amountPaid?: number
    paymentStatus: string
    approvedBy?: string
    notes?: string
  }

  const fields: Record<string, unknown> = {
    [PAYABLES.PAYABLE_TO]: body.payableTo,
    [PAYABLES.TOTAL_AMOUNT]: body.totalAmount,
    [PAYABLES.PAYMENT_STATUS]: body.paymentStatus,
  }
  if (body.category) fields[PAYABLES.CATEGORY] = body.category
  if (body.invoiceNumber) fields[PAYABLES.INVOICE_NUMBER] = body.invoiceNumber
  if (body.invoiceDate) fields[PAYABLES.INVOICE_DATE] = body.invoiceDate
  if (body.dueDate) fields[PAYABLES.DUE_DATE] = body.dueDate
  if (body.amountPaid != null) fields[PAYABLES.AMOUNT_PAID] = body.amountPaid
  if (body.approvedBy) fields[PAYABLES.APPROVED_BY] = body.approvedBy
  if (body.notes) fields[PAYABLES.NOTES] = body.notes

  const res = await fetch(`${BASE_URL}/${PAYABLES.TABLE}`, {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const err = (await res.json()) as { error?: { message?: string } }
    return NextResponse.json({ error: err.error?.message ?? 'Create failed' }, { status: 500 })
  }
  const data = (await res.json()) as { id: string }
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 })
})
