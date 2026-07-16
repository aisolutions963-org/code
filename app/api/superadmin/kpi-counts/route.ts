import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { PROJECTS } from '@/lib/fieldMap'

export const dynamic = 'force-dynamic'

const BASE_ID = process.env.AIRTABLE_BASE_ID!
const API_KEY = process.env.AIRTABLE_API_KEY!

async function fetchAllProjectStages(): Promise<{ stage: string; remaining: number }[]> {
  const results: { stage: string; remaining: number }[] = []
  let offset: string | undefined
  do {
    const params = new URLSearchParams({
      'fields[]': PROJECTS.PROJECT_STAGE,
      returnFieldsByFieldId: 'true',
      // Exclude client requests (Trade/Maintenance/Variance) and soft-deleted projects —
      // matches getProjects()/getAllProjects() filtering so KPI tiles agree with project lists.
      filterByFormula: `AND({${PROJECTS.REQUEST_TYPE}} = "", {${PROJECTS.DELETED_AT}} = BLANK())`,
    })
    params.append('fields[]', PROJECTS.REMAINING_BALANCE)
    if (offset) params.set('offset', offset)
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${PROJECTS.TABLE_ID}?${params}`,
      { headers: { Authorization: `Bearer ${API_KEY}` }, cache: 'no-store' },
    )
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`)
    const data = await res.json() as { records: { fields: Record<string, unknown> }[]; offset?: string }
    for (const r of data.records) {
      results.push({
        stage: (r.fields[PROJECTS.PROJECT_STAGE] as string) ?? '',
        remaining: (r.fields[PROJECTS.REMAINING_BALANCE] as number) ?? 0,
      })
    }
    offset = data.offset
  } while (offset)
  return results
}

export const GET = requireRole('superadmin')(async () => {
  const projects = await fetchAllProjectStages()

  let total = 0, preparing = 0, open = 0, production = 0, closing = 0, notApproved = 0
  let finished = 0, maintenanceActive = 0, maintenanceExpired = 0

  for (const p of projects) {
    total++
    if (p.stage === 'Preparing') preparing++
    else if (p.stage === 'Open') open++
    else if (p.stage === 'Production') production++
    else if (p.stage === 'Closing') closing++
    else if (p.stage === 'Not-Approved') notApproved++
    else if (p.stage === 'Closed') finished++
    else if (p.stage === 'Closed and active warranty') maintenanceActive++
    else if (p.stage === 'Warranty expired') maintenanceExpired++
  }

  return NextResponse.json({
    total, preparing, open, production, closing, notApproved,
    finished, maintenanceActive, maintenanceExpired,
  })
})
