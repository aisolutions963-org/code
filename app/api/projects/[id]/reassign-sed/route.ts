import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { updateProject, getProjectById } from '@/lib/airtable'
import { getUserByAirtableMemberId, addSedProjectMapping } from '@/lib/db'
import { createNotification } from '@/lib/notifications'
import { PROJECTS } from '@/lib/fieldMap'

// Reassign a project / client-request to another SED (sales owner).
export const PATCH = requireRole('sed', 'manager', 'superadmin')(async (req, _session, { params }) => {
  const { id } = params

  let body: { salesOwnerCollaboratorId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const collaboratorId = body.salesOwnerCollaboratorId
  if (!collaboratorId) {
    return NextResponse.json({ error: 'salesOwnerCollaboratorId is required' }, { status: 400 })
  }

  try {
    const project = await getProjectById(id)
    await updateProject(id, { [PROJECTS.SALES_OWNER]: [collaboratorId] })

    // Keep the SQLite SED→project mapping in sync so the new owner sees it,
    // and notify them.
    const user = await getUserByAirtableMemberId(collaboratorId)
    if (user) {
      await addSedProjectMapping(id, user.id)
      await createNotification({
        recipientRole: 'sed',
        recipientUserId: user.id,
        title: `Reassigned to you — ${project.projectName}`,
        body: `You are now the SED responsible for "${project.projectName}"${project.projectId ? ` (${project.projectId})` : ''}.`,
        link: '/dashboard/client-requests',
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('PATCH /api/projects/[id]/reassign-sed error:', error)
    return NextResponse.json({ error: 'Failed to reassign' }, { status: 500 })
  }
})
