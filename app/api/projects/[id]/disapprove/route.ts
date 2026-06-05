import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getProjectById, updateProject } from '@/lib/airtable'
import { PROJECTS } from '@/lib/fieldMap'
import { createNotification, ROLE_DASHBOARD } from '@/lib/notifications'

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
    if (project.projectStage === 'Not-Approved') {
      return NextResponse.json({ error: 'Project is already Not-Approved' }, { status: 400 })
    }

    const updated = await updateProject(id, {
      [PROJECTS.PROJECT_STAGE]: 'Not-Approved',
      [PROJECTS.APPROVAL_STATUS]: 'Rejected',
    })

    const projectRef = project.projectId ?? id
    const projectLabel = project.projectName ? `${projectRef} — ${project.projectName}` : projectRef

    await createNotification({
      recipientRole: 'sed',
      title: `Project not approved — ${projectRef}`,
      body: `"${projectLabel}" has been marked as Not-Approved by superadmin.`,
      link: ROLE_DASHBOARD['sed'],
    })
    await createNotification({
      recipientRole: 'manager',
      title: `Project not approved — ${projectRef}`,
      body: `"${projectLabel}" has been marked as Not-Approved by superadmin.`,
      link: ROLE_DASHBOARD['manager'],
    })

    return NextResponse.json({ project: updated })
  } catch (error) {
    console.error('POST /api/projects/[id]/disapprove error:', error)
    return NextResponse.json({ error: 'Failed to disapprove project' }, { status: 500 })
  }
}
