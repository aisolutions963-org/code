import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getClientRequestsByParentProject } from '@/lib/airtable'
import { isSedAuthorizedForProject } from '@/lib/sedAccess'

export const GET = requireRole('sed', 'manager', 'superadmin')(async (_req, session, { params }) => {
  const { id } = params
  if (session.role === 'sed' && !(await isSedAuthorizedForProject(session, id))) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  const requests = await getClientRequestsByParentProject(id)
  return NextResponse.json({ requests })
})
