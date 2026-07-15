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

  // Include the current user: an SED creating a project must be able to assign themselves
  // as the sales owner. (The Commun-SEDs picker excludes the chosen primary client-side.)
  const seds = users.filter(
    (u) => u.role === 'sed' && Number(u.active) === 1 && u.airtable_member_id,
  )

  return NextResponse.json({
    members: seds.map((u) => {
      const email = u.email?.toLowerCase()
      // A SED's active load includes projects they OWN (SALES_OWNER) and projects where
      // they're a Commun (secondary) SED — otherwise a SED assigned only as a secondary
      // shows 0. SALES_OWNER / COMMUN_SEDS link to Team Members, so the ids are member
      // record ids (== airtable_member_id). Match owner by email too for robustness.
      const projectCount = activeProjects.filter(
        (p) =>
          p.salesOwner?.id === u.airtable_member_id ||
          (!!email && p.salesOwner?.email?.toLowerCase() === email) ||
          (p.communSedIds ?? []).includes(u.airtable_member_id!),
      ).length
      return { id: u.airtable_member_id!, name: u.name, projectCount, isSelf: u.id === session.id }
    }),
  })
})
