import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  getProjectById,
  getTasksForProject,
  getAllTasksForProject,
  getPaymentsByProject,
  getGatePassesByProject,
  deleteTasksByProjectId,
  deleteProjectById,
} from '@/lib/airtable'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [project, tasks, payments, gatePasses] = await Promise.all([
      getProjectById(params.id),
      session.role === 'superadmin' || session.role === 'manager'
        ? getAllTasksForProject(params.id)
        : getTasksForProject(params.id, session.role),
      getPaymentsByProject(params.id),
      getGatePassesByProject(params.id),
    ])

    return NextResponse.json({ project: { ...project, tasks, payments, gatePasses } })
  } catch (error) {
    console.error('GET /api/projects/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session || session.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const deletedTasks = await deleteTasksByProjectId(params.id)
    await deleteProjectById(params.id)
    return NextResponse.json({ deleted: true, deletedTasks })
  } catch (error) {
    console.error('DELETE /api/projects/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
  }
}
