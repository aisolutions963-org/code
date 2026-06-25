import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getSedQuarterlyRevenue } from '@/lib/airtable'
import { getUserById, getSedProjectIdsByUserId } from '@/lib/db'
import { todayUAE } from '@/lib/dateUtils'

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

function calcCommission(revenue: number): {
  tier: 'none' | 'silver' | 'gold'
  rate: number
  amount: number
  nextThreshold: number | null
  toNext: number | null
} {
  if (revenue >= 600_000) {
    return { tier: 'gold', rate: 0.02, amount: revenue * 0.02, nextThreshold: null, toNext: null }
  }
  if (revenue >= 300_000) {
    return { tier: 'silver', rate: 0.015, amount: revenue * 0.015, nextThreshold: 600_000, toNext: 600_000 - revenue }
  }
  return { tier: 'none', rate: 0, amount: 0, nextThreshold: 300_000, toNext: 300_000 - revenue }
}

export const GET = requireRole('sed')(async (_req, session) => {
  const dbUser = await getUserById(session.id)
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const projectIds = await getSedProjectIdsByUserId(session.id)
  const { label, start, end } = getQuarter(todayUAE())
  const revenue = await getSedQuarterlyRevenue(projectIds, start, end)
  const commission = calcCommission(revenue)

  return NextResponse.json({
    quarterLabel: label,
    quarterStart: start,
    quarterEnd: end,
    quarterRevenue: revenue,
    ...commission,
  })
})
