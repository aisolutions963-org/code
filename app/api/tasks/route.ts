import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getTasksByRole, getSedProjectIds } from '@/lib/airtable'
import { getUserById, getSedProjectIdsByUserId } from '@/lib/db'
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
      const dbUser = getUserById(session.id)
      const [airtableIds, sqliteIds] = await Promise.all([
        getSedProjectIds({
          sedAirtableMemberId: dbUser?.airtable_member_id ?? undefined,
          sedEmail: session.email,
        }),
        Promise.resolve(getSedProjectIdsByUserId(session.id)),
      ])
      // Union both sources — SQLite covers projects created without airtable_member_id
      const sedProjectIds = [...new Set([...airtableIds, ...sqliteIds])]
      tasks = await getTasksByRole(role, { sedProjectIds })
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
