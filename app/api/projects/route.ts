import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getProjects, getAllProjects, getProjectById, createProject, createEndUser, generateTasksForProject, projectNameExists, getDeletedProjects } from '@/lib/airtable'
import { getUserById, getUserByAirtableMemberId, addSedProjectMapping, getSedProjectIdsByUserId } from '@/lib/db'
import { CreateProjectSchema } from '@/lib/validation'
import { createNotification } from '@/lib/notifications'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const stage = searchParams.get('stage') ?? undefined
  const all = searchParams.get('all') === 'true'
  const includeRequests = searchParams.get('includeRequests') === 'true'
  const deleted = searchParams.get('deleted') === 'true'

  // Trash view — superadmin only
  if (deleted) {
    if (session.role !== 'superadmin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    try {
      const projects = await getDeletedProjects()
      return NextResponse.json({ projects })
    } catch (error) {
      console.error('GET /api/projects?deleted error:', error)
      return NextResponse.json({ error: 'Failed to fetch deleted projects' }, { status: 500 })
    }
  }

  try {
    let projects
    if (all && session.role === 'sed') {
      // SED with all=true: include all stages (for pipeline view) but still filter to their projects
      const [dbUser, sqliteIds] = await Promise.all([
        getUserById(session.id),
        getSedProjectIdsByUserId(session.id),
      ])
      const airtableProjects = await getProjects({
        sedAirtableMemberId: dbUser?.airtable_member_id ?? undefined,
        sedEmail: session.email,
        includeAllStages: true,
      })
      const airtableProjectIds = new Set(airtableProjects.map((p) => p.id))
      const missingIds = sqliteIds.filter((id) => !airtableProjectIds.has(id))
      const extra = missingIds.length > 0
        ? await Promise.all(missingIds.map((id) => getProjectById(id).catch(() => null)))
        : []
      projects = [
        ...airtableProjects,
        ...extra.filter((p): p is NonNullable<typeof p> => p !== null),
      ]
    } else if (all) {
      projects = await getAllProjects({ includeClientRequests: includeRequests })
    } else if (session.role === 'sed') {
      const [dbUser, sqliteIds] = await Promise.all([
        getUserById(session.id),
        getSedProjectIdsByUserId(session.id),
      ])
      const airtableProjects = await getProjects({
        stage,
        sedAirtableMemberId: dbUser?.airtable_member_id ?? undefined,
        sedEmail: session.email,
      })
      // Fetch any SQLite-mapped projects not already returned by Airtable filter
      const airtableProjectIds = new Set(airtableProjects.map((p) => p.id))
      const missingIds = sqliteIds.filter((id) => !airtableProjectIds.has(id))
      const CLOSED_STAGES = new Set(['Closed', 'Closed and active warranty', 'Warranty expired'])
      const extra = missingIds.length > 0
        ? await Promise.all(missingIds.map((id) => getProjectById(id).catch(() => null)))
        : []
      projects = [
        ...airtableProjects,
        ...extra.filter((p): p is NonNullable<typeof p> => p !== null && !CLOSED_STAGES.has(p.projectStage ?? '')),
      ]
    } else {
      projects = await getProjects({ stage, includeClientRequests: includeRequests })
    }
    return NextResponse.json({ projects })
  } catch (error) {
    console.error('GET /api/projects error:', error)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || !['sed', 'manager', 'superadmin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = CreateProjectSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 },
    )
  }

  const data = { ...parsed.data }

  try {
    const duplicate = await projectNameExists(data.projectName)
    if (duplicate) {
      return NextResponse.json(
        { error: `A project named "${data.projectName}" already exists.` },
        { status: 409 },
      )
    }

    const project = await createProject(data)

    // Map the assigned sales owner so they see the project regardless of who created it
    if (data.salesOwnerCollaboratorId) {
      const salesOwnerUser = await getUserByAirtableMemberId(data.salesOwnerCollaboratorId)
      if (salesOwnerUser) await addSedProjectMapping(project.id, salesOwnerUser.id)
    }
    // If creator is SED themselves (may not have airtable_member_id), map by user ID too
    if (session.role === 'sed') {
      await addSedProjectMapping(project.id, session.id)
    }

    // Also map communal SEDs so they see the project and its tasks
    if (data.communSedIds?.length) {
      for (const communMemberId of data.communSedIds) {
        const communUser = await getUserByAirtableMemberId(communMemberId)
        if (communUser) {
          await addSedProjectMapping(project.id, communUser.id)
        }
      }
    }

    // Create End User record if provided (Broker/Contractor projects)
    if (data.endUserName && (data.clientStatus === 'Broker' || data.clientStatus === 'Contractor')) {
      createEndUser({
        name: data.endUserName,
        phoneOrEmail: data.endUserContact,
        projectId: project.id,
      }).catch((err) => console.error('[A19] createEndUser failed:', err))
    }

    // A19 — generate Phase 1 tasks; await so the response includes the count
    let tasksCreated = 0
    let tasksWarning: string | undefined
    try {
      const result = await generateTasksForProject(project.id, 'Preparing')
      tasksCreated = result.created
    } catch (err) {
      console.error('[A19] Task generation failed after project creation:', err)
      const detail = err instanceof Error ? err.message : String(err)
      tasksWarning = `Project created but tasks could not be generated: ${detail}`
    }

    // Notify the assigned SED
    if (data.salesOwnerCollaboratorId) {
      const sedUser = await getUserByAirtableMemberId(data.salesOwnerCollaboratorId)
      if (sedUser) {
        await createNotification({
          recipientRole: 'sed',
          title: `New project assigned: ${project.projectName}`,
          body: `Client: ${project.clientName}`,
          link: '/dashboard/sed?view=projects',
        })
      }
    }

    return NextResponse.json({ project, tasksCreated, ...(tasksWarning ? { warning: tasksWarning } : {}) }, { status: 201 })
  } catch (error) {
    console.error('POST /api/projects error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create project' },
      { status: 500 },
    )
  }
}
