import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getProjectById, updateProject } from '@/lib/airtable'
import { PROJECTS } from '@/lib/fieldMap'
import { createNotification, ROLE_DASHBOARD } from '@/lib/notifications'

export const POST = requireRole('superadmin')(async (req, _session, { params }) => {
  const { id } = params

  const project = await getProjectById(id)
  if (project.projectStage === 'Not-Approved') {
    return NextResponse.json({ error: 'Project is already Not-Approved' }, { status: 400 })
  }

  let reason = ''
  let note = ''
  try {
    const body = await req.json()
    reason = (body?.reason ?? '').trim()
    note = (body?.note ?? '').trim()
  } catch {
    // no body — legacy callers
  }

  const updated = await updateProject(id, {
    [PROJECTS.PROJECT_STAGE]: 'Not-Approved',
    [PROJECTS.APPROVAL_STATUS]: 'Rejected',
  })

  const projectRef = project.projectId ?? id
  const projectLabel = project.projectName ? `${projectRef} — ${project.projectName}` : projectRef
  const detail = [reason && `Reason: ${reason}`, note && `Note: ${note}`].filter(Boolean).join('\n')
  const body = `"${projectLabel}" has been marked as Not Approved by superadmin.${detail ? `\n${detail}` : ''}`

  await Promise.all([
    createNotification({
      recipientRole: 'sed',
      title: `Project not approved — ${projectRef}`,
      body,
      link: ROLE_DASHBOARD['sed'],
    }),
    createNotification({
      recipientRole: 'manager',
      title: `Project not approved — ${projectRef}`,
      body,
      link: ROLE_DASHBOARD['manager'],
    }),
  ])

  return NextResponse.json({ project: updated })
})
