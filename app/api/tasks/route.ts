import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getTasksByRole, getAllTasksForProject } from '@/lib/airtable'
import { Role } from '@/lib/types'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const roleParam = searchParams.get('role') as Role | null
  const projectId = searchParams.get('projectId') ?? undefined
  const all = searchParams.get('all') === 'true'

  // Use session role unless superadmin is requesting a specific role view
  const role: Role =
    session.role === 'superadmin' && roleParam ? roleParam : session.role

  try {
    // Manager/superadmin with all=true+projectId: return all departments (for scheduling)
    if (all && projectId && (session.role === 'manager' || session.role === 'superadmin')) {
      const tasks = await getAllTasksForProject(projectId)
      return NextResponse.json({ tasks })
    }

    const tasks = await getTasksByRole(role, { projectId })
    return NextResponse.json({ tasks })
  } catch (error) {
    console.error('GET /api/tasks error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 },
    )
  }
}
