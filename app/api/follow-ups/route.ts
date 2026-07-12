import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { FOLLOW_UP_LOG } from '@/lib/fieldMap'
import { getAllProjects } from '@/lib/airtable'
import { z } from 'zod'

const CreateFollowUpSchema = z.object({
  projectId: z.string().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  method: z.string().min(1).max(100),
  outcome: z.string().min(1).max(500),
  nextDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(2000).optional(),
})

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

// Projects that are no longer follow-up targets — excluded from the picker (but still
// resolved for display of historical logs).
const INACTIVE_STAGES = new Set(['Closed', 'Closed and active warranty', 'Warranty expired'])

async function fetchLogs(userName: string | null): Promise<RawRecord[]> {
  const records: RawRecord[] = []
  let offset: string | undefined
  do {
    const params = new URLSearchParams({ returnFieldsByFieldId: 'true' })
    params.append('fields[]', FOLLOW_UP_LOG.PROJECT)
    params.append('fields[]', FOLLOW_UP_LOG.DATE)
    params.append('fields[]', FOLLOW_UP_LOG.METHOD)
    params.append('fields[]', FOLLOW_UP_LOG.OUTCOME)
    params.append('fields[]', FOLLOW_UP_LOG.NEXT_DATE)
    params.append('fields[]', FOLLOW_UP_LOG.LOGGED_BY)
    params.append('fields[]', FOLLOW_UP_LOG.NOTES)
    if (userName) {
      const escapedName = userName.replace(/"/g, '\\"')
      params.set('filterByFormula', `{${FOLLOW_UP_LOG.LOGGED_BY}} = "${escapedName}"`)
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
  const [allProjects, logsRaw] = await Promise.all([
    getAllProjects({ includeClientRequests: true }),
    fetchLogs(isSed ? session.name : null),
  ])

  // Map every project (any stage) so historical logs resolve; the picker filters to active.
  const projectInfo = new Map(
    allProjects.map((p) => [
      p.id,
      {
        projectRef: p.projectId ?? '',
        projectName: p.nickname || p.projectName || '',
        clientName: p.clientName ?? '',
      },
    ]),
  )

  const projects = allProjects
    .filter((p) => !INACTIVE_STAGES.has(p.projectStage))
    .map((p) => ({
      id: p.id,
      projectRef: p.projectId ?? '',
      projectName: p.nickname || p.projectName || '',
      clientName: p.clientName ?? '',
    }))
    .sort((a, b) => (a.projectName || a.clientName).localeCompare(b.projectName || b.clientName))

  const logs = logsRaw.map((r) => {
    const f = r.fields
    const projectIds = Array.isArray(f[FOLLOW_UP_LOG.PROJECT]) ? (f[FOLLOW_UP_LOG.PROJECT] as string[]) : []
    const projectRecId = projectIds[0] ?? ''
    const info = projectInfo.get(projectRecId)
    return {
      id: r.id,
      projectId: projectRecId,
      projectRef: info?.projectRef ?? '',
      projectName: info?.projectName ?? '',
      clientName: info?.clientName ?? '',
      date: (f[FOLLOW_UP_LOG.DATE] as string) ?? '',
      method: (f[FOLLOW_UP_LOG.METHOD] as string) ?? '',
      outcome: (f[FOLLOW_UP_LOG.OUTCOME] as string) ?? '',
      nextDate: (f[FOLLOW_UP_LOG.NEXT_DATE] as string) || undefined,
      doneBy: (f[FOLLOW_UP_LOG.LOGGED_BY] as string) ?? '',
      notes: (f[FOLLOW_UP_LOG.NOTES] as string) || undefined,
    }
  })

  return NextResponse.json({ logs, projects })
})

export const POST = requireRole('sed', 'manager', 'superadmin')(async (req: NextRequest, session) => {
  let raw: unknown
  try { raw = await req.json() } catch { raw = {} }
  const parsed = CreateFollowUpSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const body = parsed.data

  const fields: Record<string, unknown> = {
    [FOLLOW_UP_LOG.DATE]: body.date,
    [FOLLOW_UP_LOG.METHOD]: body.method,
    [FOLLOW_UP_LOG.OUTCOME]: body.outcome,
    [FOLLOW_UP_LOG.LOGGED_BY]: session.name,
  }
  if (body.projectId) fields[FOLLOW_UP_LOG.PROJECT] = [body.projectId]
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
