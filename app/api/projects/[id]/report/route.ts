import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getProjectById, getPaymentsByProject, getTimesheetEntries } from '@/lib/airtable'
import { getUserByAirtableMemberId } from '@/lib/db'

export const GET = requireRole('superadmin', 'manager', 'sed', 'fabrication', 'installation')(
  async (req: NextRequest, session, context) => {
    const { id } = (context as { params: { id: string } }).params

    try {
      const rawProject = await getProjectById(id)
      if (!rawProject) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }

      // Resolve commun SED names from SQLite — Airtable linked-record fields return only
      // record IDs, not names, so we need to look them up ourselves.
      let resolvedCommunSeds = rawProject.communSeds
      if (rawProject.communSedIds && rawProject.communSedIds.length > 0) {
        const dbUsers = await Promise.all(
          rawProject.communSedIds.map((id) => getUserByAirtableMemberId(id).catch(() => undefined)),
        )
        const names = dbUsers.filter(Boolean).map((u) => u!.name).filter(Boolean)
        if (names.length > 0) resolvedCommunSeds = names
      }

      // Resolve salesOwner name if Airtable returned only the record ID (no name)
      let resolvedOwner = rawProject.salesOwner
      if (resolvedOwner && !resolvedOwner.name && resolvedOwner.id) {
        const dbOwner = await getUserByAirtableMemberId(resolvedOwner.id).catch(() => undefined)
        if (dbOwner) resolvedOwner = { ...resolvedOwner, name: dbOwner.name, email: dbOwner.email }
      }

      const project = { ...rawProject, communSeds: resolvedCommunSeds, salesOwner: resolvedOwner }

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
