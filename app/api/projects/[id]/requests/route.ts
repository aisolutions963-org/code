import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getClientRequestsByParentProject } from '@/lib/airtable'

export const GET = requireRole('sed', 'manager', 'superadmin')(async (_req, _session, { params }) => {
  const { id } = params
  const requests = await getClientRequestsByParentProject(id)
  return NextResponse.json({ requests })
})
