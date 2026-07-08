import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getAllProjects, getPendingApprovalsCount, getCallClientPendingTasks, getStuckTaskForProjects } from '@/lib/airtable'
import { PAYMENTS } from '@/lib/fieldMap'
import { todayUAE } from '@/lib/dateUtils'

export const dynamic = 'force-dynamic'

interface RawOverduePayment {
  id: string
  amount: number
  dueDate: string
  paymentType: string
  projectRecordId: string
}

async function getOverduePaymentsList(): Promise<RawOverduePayment[]> {
  const key = process.env.AIRTABLE_API_KEY
  const base = process.env.AIRTABLE_BASE_ID
  if (!key || !base) return []
  const today = todayUAE()
  const formula = `AND({${PAYMENTS.PAYMENT_STATUS}}="Pending", NOT({${PAYMENTS.DUE_DATE}}=BLANK()), IS_BEFORE({${PAYMENTS.DUE_DATE}}, "${today}"))`
  const results: RawOverduePayment[] = []
  let offset: string | undefined
  do {
    const parts = [
      `filterByFormula=${encodeURIComponent(formula)}`,
      `fields[]=${PAYMENTS.AMOUNT}`,
      `fields[]=${PAYMENTS.DUE_DATE}`,
      `fields[]=${PAYMENTS.PAYMENT_TYPE}`,
      `fields[]=${PAYMENTS.PROJECT}`,
    ]
    if (offset) parts.push(`offset=${encodeURIComponent(offset)}`)
    const res = await fetch(
      `https://api.airtable.com/v0/${base}/${PAYMENTS.TABLE_ID}?${parts.join('&')}`,
      { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' },
    )
    if (!res.ok) break
    const data = await res.json() as { records: { id: string; fields: Record<string, unknown> }[]; offset?: string }
    for (const rec of data.records) {
      const f = rec.fields
      const projectIds = (f[PAYMENTS.PROJECT] as string[] | undefined) ?? []
      results.push({
        id: rec.id,
        amount: (f[PAYMENTS.AMOUNT] as number | undefined) ?? 0,
        dueDate: (f[PAYMENTS.DUE_DATE] as string | undefined) ?? '',
        paymentType: (f[PAYMENTS.PAYMENT_TYPE] as string | undefined) ?? '',
        projectRecordId: projectIds[0] ?? '',
      })
    }
    offset = data.offset
  } while (offset)
  return results
}

export const GET = requireRole('superadmin')(async () => {
  const [projects, pendingApprovals, rawOverduePayments, callClientTasks] = await Promise.all([
    getAllProjects(),
    getPendingApprovalsCount(),
    getOverduePaymentsList(),
    getCallClientPendingTasks(),
  ])

  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]))

  const overduePayments = rawOverduePayments.map((p) => {
    const proj = projectById[p.projectRecordId]
    return {
      id: p.id,
      projectId: p.projectRecordId,
      projectName: proj?.projectName ?? 'Unknown Project',
      projectRef: proj?.projectId ?? undefined,
      amount: p.amount,
      dueDate: p.dueDate,
      paymentType: p.paymentType,
    }
  })

  const totalProjects = projects.length
  const activeProjects = projects.filter(
    (p) => !['Closed', 'Closed and active warranty', 'Warranty expired'].includes(p.projectStage),
  ).length
  const DAY_MS = 1000 * 60 * 60 * 24
  const CLOSED_STAGES = ['Closed', 'Closed and active warranty', 'Warranty expired']
  const staleProjectsFull = projects.filter((p) => {
    if (!p.lastModifiedTasks || CLOSED_STAGES.includes(p.projectStage)) return false
    return (Date.now() - new Date(p.lastModifiedTasks).getTime()) / DAY_MS > 3
  })
  const staleProjects = staleProjectsFull.length

  // Smarter stale detection: attach the current stuck task + days stale per project.
  const stuckMap = await getStuckTaskForProjects(staleProjectsFull.map((p) => p.id))
  const staleProjectsList = staleProjectsFull
    .map((p) => ({
      projectId: p.id,
      projectName: p.projectName,
      projectRef: p.projectId,
      daysStale: Math.floor((Date.now() - new Date(p.lastModifiedTasks!).getTime()) / DAY_MS),
      currentTask: stuckMap[p.id] ?? null,
    }))
    .sort((a, b) => b.daysStale - a.daysStale)

  const totalRevenue = projects.reduce((s, p) => s + (p.projectTotalCost ?? 0), 0)
  const totalPaid = projects.reduce((s, p) => s + (p.totalPaid ?? 0), 0)
  const totalRemaining = projects.reduce((s, p) => s + (p.remainingBalance ?? 0), 0)

  return NextResponse.json({
    totalProjects,
    activeProjects,
    staleProjects,
    staleProjectsList,
    pendingApprovals,
    overduePayments,
    totalRevenue,
    totalPaid,
    totalRemaining,
    callClientTasks,
  })
})
