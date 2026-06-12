import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getAllUsers } from '@/lib/db'

export const GET = requireRole('sed', 'manager', 'superadmin')(async (_req, session) => {
  const users = await getAllUsers()
  const seds = users.filter(
    (u) => u.role === 'sed' && Number(u.active) === 1 && u.airtable_member_id && u.id !== session.id,
  )
  return NextResponse.json({
    members: seds.map((u) => ({ id: u.airtable_member_id!, name: u.name })),
  })
})
