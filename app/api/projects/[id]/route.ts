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
  updateProject,
} from '@/lib/airtable'
import { PROJECTS } from '@/lib/fieldMap'

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session || !['sed', 'manager', 'superadmin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { quotationNumber } = body as { quotationNumber?: string }
  if (!quotationNumber || typeof quotationNumber !== 'string' || !quotationNumber.trim()) {
    return NextResponse.json({ error: 'quotationNumber is required' }, { status: 400 })
  }

  try {
    const project = await getProjectById(params.id)
    const currentQN = project.quotationNumber
    const currentRef = project.quotationReference

    let nextRef: string
    if (!currentRef || currentQN !== quotationNumber.trim()) {
      nextRef = 'R0'
    } else {
      const n = parseInt(currentRef.slice(1), 10)
      nextRef = `R${isNaN(n) ? 1 : n + 1}`
    }

    const updated = await updateProject(params.id, {
      [PROJECTS.QUOTATION_NUMBER]: quotationNumber.trim(),
      [PROJECTS.QUOTATION_REFERENCE]: nextRef,
    })
    return NextResponse.json({ project: updated })
  } catch (error) {
    console.error('PATCH /api/projects/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
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
