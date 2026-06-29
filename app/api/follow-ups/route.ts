import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { FOLLOW_UP_LOG, QUOTATIONS } from '@/lib/fieldMap'

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

async function fetchQuotations(): Promise<{ id: string; quoteNumber: string; clientName: string }[]> {
  const results: { id: string; quoteNumber: string; clientName: string }[] = []
  let offset: string | undefined
  do {
    const params = new URLSearchParams({ returnFieldsByFieldId: 'true' })
    params.append('fields[]', QUOTATIONS.QUOTE_NUMBER)
    params.append('fields[]', QUOTATIONS.CLIENT_NAME)
    params.append('sort[0][field]', QUOTATIONS.QUOTE_NUMBER)
    params.append('sort[0][direction]', 'asc')
    if (offset) params.set('offset', offset)
    const res = await fetch(`${BASE_URL}/${QUOTATIONS.TABLE_ID}?${params}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      cache: 'no-store',
    })
    if (!res.ok) break
    const data = (await res.json()) as { records: RawRecord[]; offset?: string }
    for (const r of data.records) {
      results.push({
        id: r.id,
        quoteNumber: (r.fields[QUOTATIONS.QUOTE_NUMBER] as string) ?? '',
        clientName: (r.fields[QUOTATIONS.CLIENT_NAME] as string) ?? '',
      })
    }
    offset = data.offset
  } while (offset)
  return results
}

async function fetchLogs(userName: string): Promise<RawRecord[]> {
  const records: RawRecord[] = []
  const escapedName = userName.replace(/"/g, '\\"')
  let offset: string | undefined
  do {
    const params = new URLSearchParams({ returnFieldsByFieldId: 'true' })
    params.append('fields[]', FOLLOW_UP_LOG.QUOTATION)
    params.append('fields[]', FOLLOW_UP_LOG.DATE)
    params.append('fields[]', FOLLOW_UP_LOG.METHOD)
    params.append('fields[]', FOLLOW_UP_LOG.OUTCOME)
    params.append('fields[]', FOLLOW_UP_LOG.NEXT_DATE)
    params.append('fields[]', FOLLOW_UP_LOG.DONE_BY)
    params.append('fields[]', FOLLOW_UP_LOG.NOTES)
    params.set('filterByFormula', `{${FOLLOW_UP_LOG.DONE_BY}} = "${escapedName}"`)
    params.append('sort[0][field]', FOLLOW_UP_LOG.DATE)
    params.append('sort[0][direction]', 'desc')
    if (offset) params.set('offset', offset)
    const res = await fetch(`${BASE_URL}/${FOLLOW_UP_LOG.TABLE}?${params}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      cache: 'no-store',
    })
    if (!res.ok) break
    const data = (await res.json()) as { records: RawRecord[]; offset?: string }
    records.push(...data.records)
    offset = data.offset
  } while (offset)
  return records
}

export const GET = requireRole('sed', 'manager', 'superadmin')(async (_req: NextRequest, session) => {
  const [quotations, logsRaw] = await Promise.all([
    fetchQuotations(),
    fetchLogs(session.name),
  ])

  const quotationMap = new Map(quotations.map((q) => [q.id, q]))

  const logs = logsRaw.map((r) => {
    const f = r.fields
    const quotationIds = Array.isArray(f[FOLLOW_UP_LOG.QUOTATION])
      ? (f[FOLLOW_UP_LOG.QUOTATION] as string[])
      : []
    const quotationId = quotationIds[0] ?? ''
    const quoteInfo = quotationMap.get(quotationId)
    return {
      id: r.id,
      quotationId,
      quotationNumber: quoteInfo?.quoteNumber ?? '',
      clientName: quoteInfo?.clientName ?? '',
      date: (f[FOLLOW_UP_LOG.DATE] as string) ?? '',
      method: (f[FOLLOW_UP_LOG.METHOD] as string) ?? '',
      outcome: (f[FOLLOW_UP_LOG.OUTCOME] as string) ?? '',
      nextDate: (f[FOLLOW_UP_LOG.NEXT_DATE] as string) || undefined,
      doneBy: (f[FOLLOW_UP_LOG.DONE_BY] as string) ?? '',
      notes: (f[FOLLOW_UP_LOG.NOTES] as string) || undefined,
    }
  })

  return NextResponse.json({ logs, quotations })
})

export const POST = requireRole('sed', 'manager', 'superadmin')(async (req: NextRequest, session) => {
  const body = (await req.json()) as {
    quotationId?: string
    date: string
    method: string
    outcome: string
    nextDate?: string
    notes?: string
  }

  const fields: Record<string, unknown> = {
    [FOLLOW_UP_LOG.DATE]: body.date,
    [FOLLOW_UP_LOG.METHOD]: body.method,
    [FOLLOW_UP_LOG.OUTCOME]: body.outcome,
    [FOLLOW_UP_LOG.DONE_BY]: session.name,
  }
  if (body.quotationId) fields[FOLLOW_UP_LOG.QUOTATION] = [body.quotationId]
  if (body.nextDate) fields[FOLLOW_UP_LOG.NEXT_DATE] = body.nextDate
  if (body.notes) fields[FOLLOW_UP_LOG.NOTES] = body.notes

  const res = await fetch(`${BASE_URL}/${FOLLOW_UP_LOG.TABLE}`, {
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
