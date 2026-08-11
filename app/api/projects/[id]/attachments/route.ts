import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getProjectAttachments } from '@/lib/airtable'
import { isSedAuthorizedForProject } from '@/lib/sedAccess'

export const GET = requireRole()(async (_req, session, { params }) => {
  if (session.role === 'sed' && !(await isSedAuthorizedForProject(session, params.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const tasks = await getProjectAttachments(params.id)
  return NextResponse.json({ tasks })
})
