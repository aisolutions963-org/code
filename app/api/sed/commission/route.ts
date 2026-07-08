import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getSedQuarterlyRevenue, getSedQuarterlyRevenueByProject, getProjectIdsForSedByEmail, getProjectNamesByIds } from '@/lib/airtable'
import { getUserById, getSedProjectIdsByUserId } from '@/lib/db'
import { todayUAE } from '@/lib/dateUtils'
import { calcCommission } from '@/lib/commission'

function getQuarter(dateStr: string): { label: string; start: string; end: string } {
  const d = new Date(dateStr)
  const m = d.getMonth() // 0-indexed
  const y = d.getFullYear()
  const pad = (n: number) => String(n).padStart(2, '0')

  // Fiscal quarters: Q1 = Dec–Feb, Q2 = Mar–May, Q3 = Jun–Aug, Q4 = Sep–Nov
  // December belongs to Q1 of the *next* fiscal year
  let fy: number, q: number
  let startY: number, startM: number, endY: number, endM: number

  if (m === 11) {       // December
    fy = y + 1; q = 1; startY = y; startM = 11; endY = y + 1; endM = 1
  } else if (m <= 1) {  // Jan–Feb
    fy = y; q = 1; startY = y - 1; startM = 11; endY = y; endM = 1
  } else if (m <= 4) {  // Mar–May
    fy = y; q = 2; startY = y; startM = 2; endY = y; endM = 4
  } else if (m <= 7) {  // Jun–Aug
    fy = y; q = 3; startY = y; startM = 5; endY = y; endM = 7
  } else {              // Sep–Nov
    fy = y; q = 4; startY = y; startM = 8; endY = y; endM = 10
  }

  const lastDay = new Date(endY, endM + 1, 0).getDate()
  return {
    label: `Q${q} ${fy}`,
    start: `${startY}-${pad(startM + 1)}-01`,
    end: `${endY}-${pad(endM + 1)}-${pad(lastDay)}`,
  }
}


export const GET = requireRole('sed')(async (_req, session) => {
  const dbUser = await getUserById(session.id)
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Merge SQLite-mapped projects with Airtable projects owned by this SED
  // (SQLite may miss projects created directly in Airtable or before the mapping was introduced)
  const [sqliteIds, airtableIds] = await Promise.all([
    getSedProjectIdsByUserId(session.id),
    getProjectIdsForSedByEmail(session.email),
  ])
  const projectIds = [...new Set([...sqliteIds, ...airtableIds])]

  const { label, start, end } = getQuarter(todayUAE())
  const [revenue, byProject] = await Promise.all([
    getSedQuarterlyRevenue(projectIds, start, end),
    getSedQuarterlyRevenueByProject(projectIds, start, end),
  ])
  const commission = calcCommission(revenue)

  const contributingIds = Object.keys(byProject)
  const names = contributingIds.length > 0 ? await getProjectNamesByIds(contributingIds) : {}
  const breakdown = contributingIds
    .map((id) => ({ projectId: id, name: names[id] ?? id, revenue: byProject[id] }))
    .sort((a, b) => b.revenue - a.revenue)

  return NextResponse.json({
    quarterLabel: label,
    quarterStart: start,
    quarterEnd: end,
    quarterRevenue: revenue,
    ...commission,
    breakdown,
  })
})
