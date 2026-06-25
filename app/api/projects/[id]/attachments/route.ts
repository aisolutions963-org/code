import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getProjectAttachments } from '@/lib/airtable'

export const GET = requireRole()(async (_req, _session, { params }) => {
  const tasks = await getProjectAttachments(params.id)
  return NextResponse.json({ tasks })
})
