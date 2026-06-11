import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getSedQuarterlyRevenue } from '@/lib/airtable'
import { getUserById, getSedProjectIdsByUserId } from '@/lib/db'
import { todayUAE } from '@/lib/dateUtils'

function getQuarter(dateStr: string): { label: string; start: string; end: string } {
  const d = new Date(dateStr)
  const year = d.getFullYear()
  const q = Math.floor(d.getMonth() / 3) + 1
  const startMonth = (q - 1) * 3
  const endMonth = startMonth + 2
  const lastDay = new Date(year, endMonth + 1, 0).getDate()
  return {
    label: `Q${q} ${year}`,
    start: `${year}-${String(startMonth + 1).padStart(2, '0')}-01`,
    end: `${year}-${String(endMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
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
