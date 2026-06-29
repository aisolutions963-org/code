import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { PROJECTS, TEAM_MEMBERS } from '@/lib/fieldMap'
import { calcCommission } from '@/lib/commission'

export const dynamic = 'force-dynamic'

const BASE_ID = process.env.AIRTABLE_BASE_ID!
const API_KEY = process.env.AIRTABLE_API_KEY!

interface AirtableProject {
  stage: string
  ownerId: string
  communIds: string[]
  totalPaid: number
}

async function fetchProjectsForStats(): Promise<AirtableProject[]> {
  const results: AirtableProject[] = []
  let offset: string | undefined
  do {
    const params = new URLSearchParams({ returnFieldsByFieldId: 'true' })
    params.append('fields[]', PROJECTS.PROJECT_STAGE)
    params.append('fields[]', PROJECTS.SALES_OWNER)
    params.append('fields[]', PROJECTS.COMMUN_SEDS)
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
      const ownerId =
        typeof ownerEntry === 'string'
          ? ownerEntry
          : (ownerEntry as { id?: string } | undefined)?.id ?? ''

      const rawCommun = r.fields[PROJECTS.COMMUN_SEDS]
      const communArr: Array<string | { id?: string }> = Array.isArray(rawCommun) ? rawCommun : []
      const communIds = communArr
        .map((c) => (typeof c === 'string' ? c : (c.id ?? '')))
        .filter(Boolean)

      results.push({
        stage: (r.fields[PROJECTS.PROJECT_STAGE] as string) ?? '',
        ownerId,
        communIds,
        totalPaid:
          typeof r.fields[PROJECTS.TOTAL_PAID] === 'number'
            ? (r.fields[PROJECTS.TOTAL_PAID] as number)
            : 0,
      })
    }
    offset = data.offset
  } while (offset)
  return results
}

async function fetchTeamMemberMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>() // recId → name
  let offset: string | undefined
  do {
    const params = new URLSearchParams({ returnFieldsByFieldId: 'true' })
    params.append('fields[]', TEAM_MEMBERS.NAME)
    params.append('fields[]', TEAM_MEMBERS.ACTIVE)
    if (offset) params.set('offset', offset)
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${TEAM_MEMBERS.TABLE_ID}?${params}`,
      { headers: { Authorization: `Bearer ${API_KEY}` }, cache: 'no-store' },
    )
    if (!res.ok) break
    const data = await res.json() as {
      records: { id: string; fields: Record<string, unknown> }[]
      offset?: string
    }
    for (const r of data.records) {
      const name = (r.fields[TEAM_MEMBERS.NAME] as string) ?? ''
      const active = r.fields[TEAM_MEMBERS.ACTIVE]
      if (name && active) map.set(r.id, name)
    }
    offset = data.offset
  } while (offset)
  return map
}

type SedEntry = { preparing: number; open: number; production: number; closed: number; notApproved: number; totalPaid: number }

function ensureSed(map: Record<string, SedEntry>, sedNames: string[], name: string) {
  if (!map[name]) {
    map[name] = { preparing: 0, open: 0, production: 0, closed: 0, notApproved: 0, totalPaid: 0 }
    sedNames.push(name)
  }
}

function incrementStage(entry: SedEntry, stage: string) {
  if (stage === 'Preparing') entry.preparing++
  else if (stage === 'Open') entry.open++
  else if (stage === 'Production') entry.production++
  else if (stage === 'Closed' || stage === 'Closed and active warranty' || stage === 'Warranty expired') entry.closed++
  else if (stage === 'Not-Approved') entry.notApproved++
}

export const GET = requireRole('superadmin')(async () => {
  const [projects, teamMemberMap] = await Promise.all([
    fetchProjectsForStats(),
    fetchTeamMemberMap(),
  ])

  const sedNames: string[] = []
  const map: Record<string, SedEntry> = {}

  for (const p of projects) {
    // Primary owner — gets stage count + revenue
    if (p.ownerId) {
      const name = teamMemberMap.get(p.ownerId)
      if (name) {
        ensureSed(map, sedNames, name)
        incrementStage(map[name], p.stage)
        map[name].totalPaid += p.totalPaid
      }
    }

    // Commun SEDs — get stage count only (revenue stays with primary owner)
    for (const communId of p.communIds) {
      const communName = teamMemberMap.get(communId)
      if (communName) {
        ensureSed(map, sedNames, communName)
        incrementStage(map[communName], p.stage)
      }
    }
  }

  const data = sedNames.map((name) => ({
    sedName: name,
    ...map[name],
    commission: Math.round(calcCommission(map[name].totalPaid).amount),
  }))

  return NextResponse.json({ seds: sedNames, data })
})
