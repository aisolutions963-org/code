import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getProjectById, updateProject } from '@/lib/airtable'
import { PROJECTS } from '@/lib/fieldMap'
import { createNotification, ROLE_DASHBOARD } from '@/lib/notifications'

const CLOSED_STAGES = new Set(['Closed', 'Closed and active warranty', 'Warranty expired'])

export const POST = requireRole('superadmin')(async (req, session, { params }) => {
  const { id } = params

  const project = await getProjectById(id)
  const isNotApproved = project.projectStage === 'Not-Approved'
  const isClosed = CLOSED_STAGES.has(project.projectStage)
  if (!isNotApproved && !isClosed) {
    return NextResponse.json(
      { error: 'Only Not-Approved or Closed projects can be reopened' },
      { status: 400 },
    )
  }

  let reason = ''
  try {
    const body = await req.json()
    reason = (body?.reason ?? '').trim()
  } catch {
    // no body — fine for Not-Approved reopen
  }
  // Reopening a closed project (e.g. a post-close defect) requires justification.
  if (isClosed && !reason) {
    return NextResponse.json(
      { error: 'A reason is required to reopen a closed project' },
      { status: 400 },
    )
  }

  const targetStage = isNotApproved ? 'Preparing' : 'Production'
  const updated = await updateProject(id, { [PROJECTS.PROJECT_STAGE]: targetStage })

  if (isClosed) {
    const projectRef = project.projectId ?? id
    const projectLabel = project.projectName ? `${projectRef} — ${project.projectName}` : projectRef
    await Promise.all(
      (['manager', 'sed'] as const).map((role) =>
        createNotification({
          recipientRole: role,
          title: `Project reopened — ${projectRef}`,
          body: `"${projectLabel}" was reopened to Production by ${session.name}.\nReason: ${reason}`,
          link: ROLE_DASHBOARD[role],
        }),
      ),
    )
  }

  return NextResponse.json({ project: updated })
})
