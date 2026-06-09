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
    })
    params.append('fields[]', PROJECTS.REMAINING_BALANCE)
    if (offset) params.set('offset', offset)
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${PROJECTS.TABLE_ID}?${params}`,
      { headers: { Authorization: `Bearer ${API_KEY}` }, cache: 'no-store' },
    )
    if (!res.ok) break
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

  let total = 0, preparing = 0, open = 0, notApproved = 0
  let finished = 0, maintenanceActive = 0, finishedUnpaid = 0, maintenanceExpired = 0

  for (const p of projects) {
    total++
    if (p.stage === 'Preparing') preparing++
    else if (p.stage === 'Open') open++
    else if (p.stage === 'Not-Approved') notApproved++
    else if (p.stage === 'Closed') {
      finished++
      if (p.remaining > 0) finishedUnpaid++
    } else if (p.stage === 'Closed and active warranty') maintenanceActive++
    else if (p.stage === 'Warranty expired') maintenanceExpired++
  }

  return NextResponse.json({
    total, preparing, open, notApproved,
    finished, maintenanceActive, finishedUnpaid, maintenanceExpired,
  })
})
