import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { restoreProject } from '@/lib/airtable'

export const POST = requireRole('superadmin')(async (_req, _session, { params }) => {
  const { id } = params
  try {
    const project = await restoreProject(id)
    return NextResponse.json({ project })
  } catch (error) {
    console.error('POST /api/projects/[id]/restore error:', error)
    return NextResponse.json({ error: 'Failed to restore project' }, { status: 500 })
  }
})
