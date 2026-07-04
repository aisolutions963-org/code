import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getAllUsers } from '@/lib/db'
import { getProjects } from '@/lib/airtable'

export const GET = requireRole('sed', 'manager', 'superadmin')(async (_req, session) => {
  const [users, projects] = await Promise.all([getAllUsers(), getProjects({})])

  // Active-project load per SED (by sales-owner collaborator id), so the picker
  // can show who is already loaded.
  const countByOwner = new Map<string, number>()
  for (const p of projects) {
    const ownerId = p.salesOwner?.id
    if (ownerId) countByOwner.set(ownerId, (countByOwner.get(ownerId) ?? 0) + 1)
  }

  const seds = users.filter(
    (u) => u.role === 'sed' && Number(u.active) === 1 && u.airtable_member_id && u.id !== session.id,
  )
  return NextResponse.json({
    members: seds.map((u) => ({
      id: u.airtable_member_id!,
      name: u.name,
      projectCount: countByOwner.get(u.airtable_member_id!) ?? 0,
    })),
  })
})
