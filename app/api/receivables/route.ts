import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { RECEIVABLES } from '@/lib/fieldMap'

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
  const receivables: unknown[] = []
  let offset: string | undefined
  do {
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
    if (offset) params.set('offset', offset)
    const res = await fetch(`${BASE_URL}/${RECEIVABLES.TABLE}?${params}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch receivables' }, { status: 500 })
    }
    const data = (await res.json()) as { records: RawRecord[]; offset?: string }
    for (const r of data.records) {
      const f = r.fields
      receivables.push({
        id: r.id,
        clientCompany: (f[RECEIVABLES.CLIENT_COMPANY] as string) ?? '',
        invoiceRef: (f[RECEIVABLES.INVOICE_REF] as string) ?? '',
        originalAmount: typeof f[RECEIVABLES.ORIGINAL_AMOUNT] === 'number' ? (f[RECEIVABLES.ORIGINAL_AMOUNT] as number) : 0,
        collected: typeof f[RECEIVABLES.COLLECTED] === 'number' ? (f[RECEIVABLES.COLLECTED] as number) : 0,
        balanceDue: typeof f[RECEIVABLES.BALANCE_DUE] === 'number' ? (f[RECEIVABLES.BALANCE_DUE] as number) : 0,
        invoiceDate: (f[RECEIVABLES.INVOICE_DATE] as string) ?? '',
        lastContact: (f[RECEIVABLES.LAST_CONTACT] as string) ?? '',
        agreedDate: (f[RECEIVABLES.AGREED_DATE] as string) ?? '',
        debtAge: typeof f[RECEIVABLES.DEBT_AGE] === 'number' ? (f[RECEIVABLES.DEBT_AGE] as number) : null,
        debtStatus: (f[RECEIVABLES.DEBT_STATUS] as string) ?? '',
        notes: (f[RECEIVABLES.NOTES] as string) ?? '',
      })
    }
    offset = data.offset
  } while (offset)
  return NextResponse.json({ receivables })
})

export const POST = requireRole('manager', 'superadmin')(async (req: NextRequest) => {
  const body = (await req.json()) as {
    clientCompany: string
    invoiceRef?: string
    originalAmount: number
    collected?: number
    invoiceDate?: string
    lastContact?: string
    agreedDate?: string
    debtStatus?: string
    notes?: string
  }

  const fields: Record<string, unknown> = {
    [RECEIVABLES.CLIENT_COMPANY]: body.clientCompany,
    [RECEIVABLES.ORIGINAL_AMOUNT]: body.originalAmount,
  }
  if (body.invoiceRef) fields[RECEIVABLES.INVOICE_REF] = body.invoiceRef
  if (body.collected != null) fields[RECEIVABLES.COLLECTED] = body.collected
  if (body.invoiceDate) fields[RECEIVABLES.INVOICE_DATE] = body.invoiceDate
  if (body.lastContact) fields[RECEIVABLES.LAST_CONTACT] = body.lastContact
  if (body.agreedDate) fields[RECEIVABLES.AGREED_DATE] = body.agreedDate
  if (body.debtStatus) fields[RECEIVABLES.DEBT_STATUS] = body.debtStatus
  if (body.notes) fields[RECEIVABLES.NOTES] = body.notes

  const res = await fetch(`${BASE_URL}/${RECEIVABLES.TABLE}`, {
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
