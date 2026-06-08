import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { PROJECTS } from '@/lib/fieldMap'
import { getAllUsers } from '@/lib/db'

export const dynamic = 'force-dynamic'

const BASE_ID = process.env.AIRTABLE_BASE_ID!
const API_KEY = process.env.AIRTABLE_API_KEY!

const COMMISSION_RATE = 0.015

interface AirtableProject {
  stage: string
  ownerId: string
  ownerEmail: string
  ownerName: string
  totalPaid: number
}

async function fetchProjectsForStats(): Promise<AirtableProject[]> {
  const results: AirtableProject[] = []
  let offset: string | undefined
  do {
    const params = new URLSearchParams({ returnFieldsByFieldId: 'true' })
    params.append('fields[]', PROJECTS.PROJECT_STAGE)
    params.append('fields[]', PROJECTS.SALES_OWNER)
    params.append('fields[]', PROJECTS.TOTAL_PAID)
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
      const rawOwner = r.fields[PROJECTS.SALES_OWNER]
      const ownerArr = Array.isArray(rawOwner) ? rawOwner : (rawOwner ? [rawOwner] : [])
      const ownerEntry = ownerArr[0]
      const ownerId = typeof ownerEntry === 'string' ? ownerEntry : (ownerEntry as { id?: string } | undefined)?.id ?? ''
      const ownerName = typeof ownerEntry === 'string' ? '' : (ownerEntry as { name?: string } | undefined)?.name ?? ''
      const ownerEmail = typeof ownerEntry === 'string' ? '' : (ownerEntry as { email?: string } | undefined)?.email?.toLowerCase() ?? ''
      results.push({
        stage: (r.fields[PROJECTS.PROJECT_STAGE] as string) ?? '',
        ownerId,
        ownerEmail,
        ownerName,
        totalPaid: typeof r.fields[PROJECTS.TOTAL_PAID] === 'number' ? (r.fields[PROJECTS.TOTAL_PAID] as number) : 0,
      })
    }
    offset = data.offset
  } while (offset)
  return results
}

export const GET = requireRole('superadmin')(async () => {
  const [projects, allUsers] = await Promise.all([
    fetchProjectsForStats(),
    getAllUsers(),
  ])

  const sedUsers = allUsers.filter((u) => u.role === 'sed' && Number(u.active) === 1)

  // Match by airtable_member_id first (most reliable), fall back to email
  const memberIdToName = new Map<string, string>()
  const emailToName = new Map<string, string>()
  for (const u of sedUsers) {
    if (u.airtable_member_id) memberIdToName.set(u.airtable_member_id, u.name)
    emailToName.set(u.email.toLowerCase(), u.name)
  }

  const sedNames = sedUsers.map((u) => u.name)

  const map: Record<string, { preparing: number; open: number; closed: number; notApproved: number; totalPaid: number }> = {}
  for (const name of sedNames) {
    map[name] = { preparing: 0, open: 0, closed: 0, notApproved: 0, totalPaid: 0 }
  }

  for (const p of projects) {
    if (!p.ownerId && !p.ownerEmail) continue
    const displayName =
      (p.ownerId ? memberIdToName.get(p.ownerId) : undefined) ??
      (p.ownerEmail ? emailToName.get(p.ownerEmail) : undefined) ??
      p.ownerName
    if (!displayName) continue
    if (!map[displayName]) {
      map[displayName] = { preparing: 0, open: 0, closed: 0, notApproved: 0, totalPaid: 0 }
      if (!sedNames.includes(displayName)) sedNames.push(displayName)
    }
    const entry = map[displayName]
    if (p.stage === 'Preparing') entry.preparing++
    else if (p.stage === 'Open') entry.open++
    else if (p.stage === 'Closed' || p.stage === 'Closed & Valid Maintenance' || p.stage === 'Closed & Warranty Done') entry.closed++
    else if (p.stage === 'Not-Approved') entry.notApproved++
    entry.totalPaid += p.totalPaid
  }

  const data = sedNames
    .filter((name) => map[name])
    .map((name) => ({
      sedName: name,
      ...map[name],
      commission: Math.round(map[name].totalPaid * COMMISSION_RATE),
    }))

  return NextResponse.json({ seds: sedNames, data })
})
