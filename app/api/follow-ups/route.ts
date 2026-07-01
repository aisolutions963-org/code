import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { FOLLOW_UP_LOG, QUOTATIONS, PROJECTS } from '@/lib/fieldMap'

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

async function fetchQuotations(): Promise<{ id: string; projectId: string; quoteNumber: string; clientName: string }[]> {
  const results: { id: string; projectId: string; quoteNumber: string; clientName: string }[] = []
  let offset: string | undefined
  do {
    const params = new URLSearchParams({ returnFieldsByFieldId: 'true' })
    params.append('fields[]', QUOTATIONS.QUOTE_NUMBER)
    params.append('fields[]', QUOTATIONS.CLIENT_NAME)
    params.append('fields[]', QUOTATIONS.PROJECT)
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
      const projectIds = r.fields[QUOTATIONS.PROJECT] as string[] | undefined
      results.push({
        id: r.id,
        projectId: projectIds?.[0] ?? '',
        quoteNumber: (r.fields[QUOTATIONS.QUOTE_NUMBER] as string) ?? '',
        clientName: (r.fields[QUOTATIONS.CLIENT_NAME] as string) ?? '',
      })
    }
    offset = data.offset
  } while (offset)
  return results
}

const INACTIVE_STAGES = new Set(['Closed', 'Closed and active warranty', 'Warranty expired'])

async function fetchProjectsById(
  projectIds: string[],
): Promise<Map<string, { quotationNumber: string; quotationReference: string; clientName: string; stage: string }>> {
  if (projectIds.length === 0) return new Map()
  const map = new Map<string, { quotationNumber: string; quotationReference: string; clientName: string; stage: string }>()
  for (let i = 0; i < projectIds.length; i += 50) {
    const batch = projectIds.slice(i, i + 50)
    const formula =
      batch.length === 1
        ? `RECORD_ID() = "${batch[0]}"`
        : `OR(${batch.map((id) => `RECORD_ID() = "${id}"`).join(',')})`
    const params = new URLSearchParams({ returnFieldsByFieldId: 'true', filterByFormula: formula })
    params.append('fields[]', PROJECTS.QUOTATION_NUMBER)
    params.append('fields[]', PROJECTS.QUOTATION_REFERENCE)
    params.append('fields[]', PROJECTS.CLIENT_NAME)
    params.append('fields[]', PROJECTS.PROJECT_STAGE)
    const res = await fetch(`${BASE_URL}/${PROJECTS.TABLE_ID}?${params}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      cache: 'no-store',
    })
    if (!res.ok) continue
    const data = (await res.json()) as { records: RawRecord[] }
    for (const r of data.records) {
      map.set(r.id, {
        quotationNumber: (r.fields[PROJECTS.QUOTATION_NUMBER] as string) ?? '',
        quotationReference: (r.fields[PROJECTS.QUOTATION_REFERENCE] as string) ?? '',
        clientName: (r.fields[PROJECTS.CLIENT_NAME] as string) ?? '',
        stage: (r.fields[PROJECTS.PROJECT_STAGE] as string) ?? '',
      })
    }
  }
  return map
}

async function fetchLogs(userName: string | null): Promise<RawRecord[]> {
  const records: RawRecord[] = []
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
    if (userName) {
      const escapedName = userName.replace(/"/g, '\\"')
      params.set('filterByFormula', `{${FOLLOW_UP_LOG.DONE_BY}} = "${escapedName}"`)
    }
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
  const isSed = session.role === 'sed'
  const [quotationsRaw, logsRaw] = await Promise.all([
    fetchQuotations(),
    fetchLogs(isSed ? session.name : null),
  ])

  const uniqueProjectIds = [...new Set(quotationsRaw.map((q) => q.projectId).filter(Boolean))]
  const projectMap = await fetchProjectsById(uniqueProjectIds)

  const quotationMap = new Map(
    quotationsRaw.map((q) => {
      const proj = projectMap.get(q.projectId)
      return [
        q.id,
        {
          quoteNumber: proj?.quotationNumber ?? q.quoteNumber,
          quotationReference: proj?.quotationReference ?? '',
          clientName: proj?.clientName ?? q.clientName,
        },
      ]
    }),
  )

  const quotations = quotationsRaw
    .filter((q) => {
      if (!q.projectId) return true
      const proj = projectMap.get(q.projectId)
      return !proj || !INACTIVE_STAGES.has(proj.stage)
    })
    .map((q) => {
      const proj = projectMap.get(q.projectId)
      return {
        id: q.id,
        quoteNumber: proj?.quotationNumber ?? q.quoteNumber,
        quotationReference: proj?.quotationReference ?? '',
        clientName: proj?.clientName ?? q.clientName,
      }
    })

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
      quotationReference: quoteInfo?.quotationReference ?? '',
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
