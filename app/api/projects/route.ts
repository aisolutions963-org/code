import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getProjects, getAllProjects, createProject, generateTasksForProject, projectNameExists } from '@/lib/airtable'
import { getUserById } from '@/lib/db'
import { CreateProjectSchema } from '@/lib/validation'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const stage = searchParams.get('stage') ?? undefined
  const all = searchParams.get('all') === 'true'

  try {
    const sedEmail = session.role === 'sed' ? session.email : undefined
    const projects = all ? await getAllProjects() : await getProjects({ stage, sedEmail })
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
  if (!data.salesOwnerCollaboratorId) {
    const dbUser = getUserById(session.id)
    if (dbUser?.airtable_member_id) {
      data.salesOwnerCollaboratorId = dbUser.airtable_member_id
    }
  }

  try {
    const duplicate = await projectNameExists(data.projectName)
    if (duplicate) {
      return NextResponse.json(
        { error: `A project named "${data.projectName}" already exists.` },
        { status: 409 },
      )
    }

    const project = await createProject(data)

    // A19 — generate Phase 1 tasks; await so the response includes the count
    let tasksCreated = 0
    let tasksWarning: string | undefined
    try {
      const result = await generateTasksForProject(project.id, 'Preparing')
      tasksCreated = result.created
    } catch (err) {
      console.error('[A19] Task generation failed after project creation:', err)
      tasksWarning = 'Project created but tasks could not be generated — use the ⚡ button to retry.'
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
