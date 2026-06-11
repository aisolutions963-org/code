import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { createClientRequest, getClientRequests } from '@/lib/airtable'
import { getUserById } from '@/lib/db'
import { addSedProjectMapping } from '@/lib/db'
import { CreateClientRequestSchema } from '@/lib/validation'

export const GET = requireRole('sed', 'manager', 'superadmin')(async (_req, session) => {
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

  if (session.role === 'sed' && !data.salesOwnerCollaboratorId) {
    const dbUser = await getUserById(session.id)
    if (dbUser?.airtable_member_id) {
      data.salesOwnerCollaboratorId = dbUser.airtable_member_id
    }
  }

  let project: Awaited<ReturnType<typeof createClientRequest>>['project']
  let tasks: Awaited<ReturnType<typeof createClientRequest>>['tasks']
  try {
    const result = await createClientRequest(data)
    project = result.project
    tasks = result.tasks
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to create request'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  if (session.role === 'sed') {
    await addSedProjectMapping(project.id, session.id)
  }

  return NextResponse.json(
    { request: { ...project, tasks }, tasksCreated: tasks.length },
    { status: 201 },
  )
})
