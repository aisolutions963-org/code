import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getInstallationTeamMembers } from '@/lib/airtable'

export const GET = requireRole()(async () => {
  const members = await getInstallationTeamMembers()
  return NextResponse.json({ members })
})
