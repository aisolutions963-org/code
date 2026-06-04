import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getProjectById, updateProject } from '@/lib/airtable'
import { PROJECTS } from '@/lib/fieldMap'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await getSession()
  if (!session || session.role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const project = await getProjectById(id)
    if (project.projectStage !== 'Not-Approved') {
      return NextResponse.json(
        { error: 'Project must be in Not-Approved stage to reopen' },
        { status: 400 },
      )
    }

    const updated = await updateProject(id, {
      [PROJECTS.PROJECT_STAGE]: 'Preparing',
    })

    return NextResponse.json({ project: updated })
  } catch (error) {
    console.error('POST /api/projects/[id]/reopen error:', error)
    return NextResponse.json({ error: 'Failed to reopen project' }, { status: 500 })
  }
}
