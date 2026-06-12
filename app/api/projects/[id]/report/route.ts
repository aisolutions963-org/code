import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getProjectById, getPaymentsByProject, getTimesheetEntries } from '@/lib/airtable'

export const GET = requireRole('superadmin', 'manager', 'sed', 'fabrication', 'installation')(
  async (req: NextRequest, session, context) => {
    const { id } = (context as { params: { id: string } }).params

    try {
      const project = await getProjectById(id)
      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }

      const canSeeFinancials = session.role === 'manager' || session.role === 'superadmin'

      let payments = undefined
      let timesheetSummary = undefined

      if (canSeeFinancials) {
        const [rawPayments, entries] = await Promise.all([
          getPaymentsByProject(id),
          getTimesheetEntries({ projectId: id }),
        ])

        payments = rawPayments

        const totalRegularHours = entries.reduce((s, e) => s + e.regularHours, 0)
        const totalOvertimeHours = entries.reduce((s, e) => s + e.overtimeHours, 0)
        const totalHours = entries.reduce((s, e) => s + e.totalHours, 0)
        const estimatedTotalCost = entries.reduce((s, e) => s + (e.estimatedCost ?? 0), 0)

        timesheetSummary = {
          entryCount: entries.length,
          totalRegularHours,
          totalOvertimeHours,
          totalHours,
          estimatedTotalCost: estimatedTotalCost > 0 ? estimatedTotalCost : undefined,
        }
      }

      return NextResponse.json({ project, payments, timesheetSummary })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load report'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  },
)
