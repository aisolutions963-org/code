import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { PROJECTS, MAINTENANCE } from '@/lib/fieldMap'

export const dynamic = 'force-dynamic'

const BASE_ID = process.env.AIRTABLE_BASE_ID!
const API_KEY = process.env.AIRTABLE_API_KEY!

async function fetchAll(tableId: string, params: Record<string, string | string[]>) {
  const records: { id: string; fields: Record<string, unknown> }[] = []
  let offset: string | undefined
  do {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) v.forEach(f => p.append(k, f))
      else p.set(k, v)
    }
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

export const GET = requireRole('manager', 'superadmin', 'sed', 'installation', 'fabrication')(async () => {
  const today = new Date().toISOString().slice(0, 10)

  const [projects, expiredMaint] = await Promise.all([
    fetchAll(PROJECTS.TABLE_ID, {
      returnFieldsByFieldId: 'true',
      'fields[]': [PROJECTS.PROJECT_ID, PROJECTS.PROJECT_NAME, PROJECTS.NICKNAME],
    }),
    fetchAll(MAINTENANCE.TABLE_ID, {
      returnFieldsByFieldId: 'true',
      filterByFormula: `AND(NOT({${MAINTENANCE.END_DATE}}=BLANK()),IS_BEFORE({${MAINTENANCE.END_DATE}},"${today}"))`,
      'fields[]': [MAINTENANCE.PROJECTS],
    }),
  ])

  const expiredProjectIds = new Set<string>()
  for (const m of expiredMaint) {
    const linked = m.fields[MAINTENANCE.PROJECTS]
    if (Array.isArray(linked)) linked.forEach(id => expiredProjectIds.add(id as string))
  }

  const result = projects
    .filter(p => !expiredProjectIds.has(p.id))
    .map(p => ({
      id: p.id,
      name: (
        (p.fields[PROJECTS.NICKNAME] as string | undefined) ??
        (p.fields[PROJECTS.PROJECT_NAME] as string | undefined) ??
        (p.fields[PROJECTS.PROJECT_ID] as string | undefined) ??
        p.id
      ),
      projectRef: (p.fields[PROJECTS.PROJECT_ID] as string | undefined) ?? '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({ projects: result })
}) as () => Promise<NextResponse>
