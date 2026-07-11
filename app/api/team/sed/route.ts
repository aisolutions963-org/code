import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getAllUsers } from '@/lib/db'
import { getAllProjects } from '@/lib/airtable'

// A project counts as "active" for a SED as long as it isn't closed.
const CLOSED_STAGES = new Set(['Closed', 'Closed and active warranty', 'Warranty expired', 'Not-Approved'])

export const GET = requireRole('sed', 'manager', 'superadmin')(async (_req, session) => {
  // Include client-request (Trade/Maintenance/Variance) projects and every stage, then
  // filter to non-closed here — a SED's Trade/Maintenance work still counts as active load.
  const [users, projects] = await Promise.all([
    getAllUsers(),
    getAllProjects({ includeClientRequests: true }),
  ])
  const activeProjects = projects.filter((p) => !CLOSED_STAGES.has(p.projectStage))

  const seds = users.filter(
    (u) => u.role === 'sed' && Number(u.active) === 1 && u.airtable_member_id && u.id !== session.id,
  )

  return NextResponse.json({
    members: seds.map((u) => {
      const email = u.email?.toLowerCase()
      // SALES_OWNER links to Team Members, so salesOwner.id is the member record id
      // (== airtable_member_id). Match by email too for robustness.
      const projectCount = activeProjects.filter(
        (p) =>
          p.salesOwner?.id === u.airtable_member_id ||
          (!!email && p.salesOwner?.email?.toLowerCase() === email),
      ).length
      return { id: u.airtable_member_id!, name: u.name, projectCount }
    }),
  })
})
