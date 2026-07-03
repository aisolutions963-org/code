import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getTasksByRole } from '@/lib/airtable'
import { resolveSedProjectIds } from '@/lib/sedAccess'
import { Role } from '@/lib/types'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const roleParam = searchParams.get('role') as Role | null
  const projectId = searchParams.get('projectId') ?? undefined

  // Use session role unless superadmin is requesting a specific role view
  const role: Role =
    session.role === 'superadmin' && roleParam ? roleParam : session.role

  try {
    let tasks
    if (role === 'sed' && !projectId) {
      // Union both sources — SQLite covers projects created without airtable_member_id
      const sedProjectIds = await resolveSedProjectIds(session)
      tasks = await getTasksByRole(role, { sedProjectIds })
    } else if (role === 'sed' && projectId) {
      const sedProjectIds = await resolveSedProjectIds(session)
      if (!sedProjectIds.includes(projectId)) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }
      tasks = await getTasksByRole(role, { projectId })
    } else {
      tasks = await getTasksByRole(role, { projectId })
    }
    return NextResponse.json({ tasks })
  } catch (error) {
    console.error('GET /api/tasks error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 },
    )
  }
}
