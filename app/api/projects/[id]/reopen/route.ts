import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getProjectById, updateProject } from '@/lib/airtable'
import { PROJECTS } from '@/lib/fieldMap'

export const POST = requireRole('superadmin')(async (_req, _session, { params }) => {
  const { id } = params

  const project = await getProjectById(id)
  if (project.projectStage !== 'Not-Approved') {
    return NextResponse.json(
      { error: 'Project must be in Not-Approved stage to reopen' },
      { status: 400 },
    )
  }

  const updated = await updateProject(id, { [PROJECTS.PROJECT_STAGE]: 'Preparing' })
  return NextResponse.json({ project: updated })
})
