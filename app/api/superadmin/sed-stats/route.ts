import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { PROJECTS } from '@/lib/fieldMap'
import db from '@/lib/db'

export const dynamic = 'force-dynamic'

const BASE_ID = process.env.AIRTABLE_BASE_ID!
const API_KEY = process.env.AIRTABLE_API_KEY!

interface AirtableProject {
  stage: string
  ownerEmail: string
  ownerName: string
}

async function fetchProjectsForStats(): Promise<AirtableProject[]> {
  const results: AirtableProject[] = []
  let offset: string | undefined
  do {
    const params = new URLSearchParams({ returnFieldsByFieldId: 'true' })
    params.append('fields[]', PROJECTS.PROJECT_STAGE)
    params.append('fields[]', PROJECTS.SALES_OWNER)
    if (offset) params.set('offset', offset)
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${PROJECTS.TABLE_ID}?${params}`,
      { headers: { Authorization: `Bearer ${API_KEY}` }, cache: 'no-store' },
    )
    if (!res.ok) break
    const data = await res.json() as {
      records: { fields: Record<string, unknown> }[]
      offset?: string
    }
    for (const r of data.records) {
      const owner = r.fields[PROJECTS.SALES_OWNER] as { name?: string; email?: string } | undefined
      results.push({
        stage: (r.fields[PROJECTS.PROJECT_STAGE] as string) ?? '',
        ownerEmail: owner?.email?.toLowerCase() ?? '',
        ownerName: owner?.name ?? owner?.email ?? '',
      })
    }
    offset = data.offset
  } while (offset)
  return results
}

export const GET = requireRole('superadmin')(async () => {
  const [projects, sedUsers] = await Promise.all([
    fetchProjectsForStats(),
    Promise.resolve(
      (db.prepare(`SELECT name, email FROM users WHERE role = 'sed' AND active = 1 ORDER BY name`).all() as { name: string; email: string }[]),
    ),
  ])

  // Match by email (reliable), display by DB name
  const emailToName = new Map<string, string>()
  for (const u of sedUsers) emailToName.set(u.email.toLowerCase(), u.name)

  const sedNames = sedUsers.map((u) => u.name)

  // Group counts by resolved display name
  const map: Record<string, { preparing: number; open: number; closed: number; notApproved: number }> = {}
  for (const name of sedNames) {
    map[name] = { preparing: 0, open: 0, closed: 0, notApproved: 0 }
  }

  for (const p of projects) {
    if (!p.ownerEmail) continue
    // Resolve to DB display name via email match; fall back to Airtable name
    const displayName = emailToName.get(p.ownerEmail) ?? p.ownerName
    if (!displayName) continue
    if (!map[displayName]) {
      map[displayName] = { preparing: 0, open: 0, closed: 0, notApproved: 0 }
      if (!sedNames.includes(displayName)) sedNames.push(displayName)
    }
    const entry = map[displayName]
    if (p.stage === 'Preparing') entry.preparing++
    else if (p.stage === 'Open') entry.open++
    else if (p.stage === 'Closed' || p.stage === 'Closed & Valid Maintenance' || p.stage === 'Closed & Warranty Done') entry.closed++
    else if (p.stage === 'Not-Approved') entry.notApproved++
  }

  const data = sedNames
    .filter((name) => map[name])
    .map((name) => ({ sedName: name, ...map[name] }))

  return NextResponse.json({ seds: sedNames, data })
})
