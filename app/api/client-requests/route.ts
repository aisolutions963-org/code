import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { createClientRequest, getClientRequests, getProjectById } from '@/lib/airtable'
import { getUserById, getUserByAirtableMemberId, addSedProjectMapping } from '@/lib/db'
import { CreateClientRequestSchema } from '@/lib/validation'

export const GET = requireRole('sed', 'manager', 'superadmin', 'installation')(async (_req, session) => {
  let sedAirtableMemberId: string | undefined
  if (session.role === 'sed') {
    const dbUser = await getUserById(session.id)
    sedAirtableMemberId = dbUser?.airtable_member_id ?? undefined
  }
  const requests = await getClientRequests({ sedAirtableMemberId })
  return NextResponse.json({ requests })
})

export const POST = requireRole('sed', 'manager', 'superadmin')(async (req, session) => {
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = CreateClientRequestSchema.safeParse(rawBody)
  if (!parsed.success) {
    const messages = parsed.error.issues.map((i) => i.message).filter(Boolean)
    return NextResponse.json(
      { error: messages[0] ?? 'Validation failed' },
      { status: 400 },
    )
  }

  const data = { ...parsed.data }

  // Inherit SED, client name, and client phone from the parent project
  if (data.parentProjectId) {
    try {
      const parentProject = await getProjectById(data.parentProjectId)
      if (parentProject?.salesOwner?.id) {
        // Validate the member exists in DB — stale Airtable record IDs cause a 422
        const sedUser = await getUserByAirtableMemberId(parentProject.salesOwner.id)
        if (sedUser) data.salesOwnerCollaboratorId = parentProject.salesOwner.id
        else data.salesOwnerCollaboratorId = undefined
      }
      if (parentProject?.clientName) {
        data.clientName = parentProject.clientName
      }
      if (parentProject?.clientPhone && !data.clientPhone) {
        data.clientPhone = parentProject.clientPhone
      }
    } catch {
      // proceed without inheritance if parent lookup fails
    }
  }

  // Final guard: clear salesOwnerCollaboratorId if not in DB to prevent Airtable 422
  if (data.salesOwnerCollaboratorId) {
    const precheck = await getUserByAirtableMemberId(data.salesOwnerCollaboratorId)
    if (!precheck) data.salesOwnerCollaboratorId = undefined
  }

  let project: Awaited<ReturnType<typeof createClientRequest>>['project']
  let tasksCreated: number
  let taskGenerationFailed: boolean | undefined
  try {
    const result = await createClientRequest(data)
    project = result.project
    tasksCreated = result.tasksCreated
    taskGenerationFailed = result.taskGenerationFailed
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to create request'
    console.error('[POST /api/client-requests] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Map the inherited SED so they see this request in their list
  if (data.salesOwnerCollaboratorId) {
    const sedUser = await getUserByAirtableMemberId(data.salesOwnerCollaboratorId)
    if (sedUser) await addSedProjectMapping(project.id, sedUser.id)
  }
  // Also map the creator if they're a SED (covers the case where they have no airtable_member_id)
  if (session.role === 'sed') {
    await addSedProjectMapping(project.id, session.id)
  }

  const warning = taskGenerationFailed
    ? 'Variance project created but task generation failed — open the project and regenerate tasks.'
    : undefined

  return NextResponse.json(
    { request: project, tasksCreated, ...(warning ? { warning } : {}) },
    { status: 201 },
  )
})
