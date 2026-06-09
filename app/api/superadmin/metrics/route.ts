import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getAllProjects, getPendingApprovalsCount, getCallClientPendingTasks } from '@/lib/airtable'
import { PAYMENTS } from '@/lib/fieldMap'
import { todayUAE } from '@/lib/dateUtils'

export const dynamic = 'force-dynamic'

async function getOverduePaymentsCount(): Promise<number> {
  const key = process.env.AIRTABLE_API_KEY
  const base = process.env.AIRTABLE_BASE_ID
  if (!key || !base) return 0
  const today = todayUAE()
  const formula = `AND({${PAYMENTS.PAYMENT_STATUS}}="Pending", NOT({${PAYMENTS.DUE_DATE}}=BLANK()), IS_BEFORE({${PAYMENTS.DUE_DATE}}, "${today}"))`
  let count = 0
  let offset: string | undefined
  do {
    const parts = [
      `filterByFormula=${encodeURIComponent(formula)}`,
      `fields[]=${PAYMENTS.PAYMENT_STATUS}`,
    ]
    if (offset) parts.push(`offset=${encodeURIComponent(offset)}`)
    const res = await fetch(
      `https://api.airtable.com/v0/${base}/${PAYMENTS.TABLE_ID}?${parts.join('&')}`,
      { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' },
    )
    if (!res.ok) break
    const data = await res.json() as { records: unknown[]; offset?: string }
    count += data.records.length
    offset = data.offset
  } while (offset)
  return count
}

export const GET = requireRole('superadmin')(async () => {
  const [projects, pendingApprovals, overduePayments, callClientTasks] = await Promise.all([
    getAllProjects(),
    getPendingApprovalsCount(),
    getOverduePaymentsCount(),
    getCallClientPendingTasks(),
  ])

  const totalProjects = projects.length
  const activeProjects = projects.filter(
    (p) => !['Closed', 'Closed and active warranty', 'Warranty expired'].includes(p.projectStage),
  ).length
  const staleProjects = projects.filter((p) => {
    if (!p.lastModifiedTasks || ['Closed', 'Archived'].includes(p.projectStage)) return false
    return (Date.now() - new Date(p.lastModifiedTasks).getTime()) / (1000 * 60 * 60 * 24) > 3
  }).length
  const totalRevenue = projects.reduce((s, p) => s + (p.projectTotalCost ?? 0), 0)
  const totalPaid = projects.reduce((s, p) => s + (p.totalPaid ?? 0), 0)
  const totalRemaining = projects.reduce((s, p) => s + (p.remainingBalance ?? 0), 0)

  return NextResponse.json({
    totalProjects,
    activeProjects,
    staleProjects,
    pendingApprovals,
    overduePayments,
    totalRevenue,
    totalPaid,
    totalRemaining,
    callClientTasks,
  })
})
