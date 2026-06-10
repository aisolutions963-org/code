import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  getProjectById,
  getTasksForProject,
  getAllTasksForProject,
  getPaymentsByProject,
  deleteTasksByProjectId,
  deleteProjectById,
  updateProject,
} from '@/lib/airtable'
import { PROJECTS } from '@/lib/fieldMap'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const canSeePayments = session.role === 'manager' || session.role === 'superadmin'

  try {
    const [project, tasks, payments] = await Promise.all([
      getProjectById(id),
      session.role === 'superadmin' || session.role === 'manager'
        ? getAllTasksForProject(id)
        : getTasksForProject(id, session.role),
      canSeePayments ? getPaymentsByProject(id) : Promise.resolve([]),
    ])

    return NextResponse.json({ project: { ...project, tasks, payments } })
  } catch (error) {
    console.error('GET /api/projects/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
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

  const parsed = body as { quotationNumber?: string; quotationReference?: string; notes?: string; assignedInstallationTeam?: string }

  // Installation team assignment
  if ('assignedInstallationTeam' in parsed) {
    if (typeof parsed.assignedInstallationTeam !== 'string' || !parsed.assignedInstallationTeam.trim()) {
      return NextResponse.json({ error: 'assignedInstallationTeam must be a non-empty string' }, { status: 400 })
    }
    try {
      await updateProject(id, {
        [PROJECTS.ASSIGNED_INSTALLATION_TEAM]: [parsed.assignedInstallationTeam.trim()],
      })
      return NextResponse.json({ ok: true })
    } catch (error) {
      console.error('PATCH /api/projects/[id] assignedInstallationTeam error:', error)
      return NextResponse.json({ error: 'Failed to assign installation team' }, { status: 500 })
    }
  }

  // Notes-only update
  if ('notes' in parsed && !parsed.quotationNumber) {
    if (typeof parsed.notes !== 'string') {
      return NextResponse.json({ error: 'notes must be a string' }, { status: 400 })
    }
    try {
      const updated = await updateProject(id, {
        [PROJECTS.MANAGER_NOTES]: parsed.notes.trim(),
      })
      return NextResponse.json({ project: updated })
    } catch (error) {
      console.error('PATCH /api/projects/[id] notes error:', error)
      return NextResponse.json({ error: 'Failed to update notes' }, { status: 500 })
    }
  }

  const { quotationNumber, quotationReference } = parsed
  if (!quotationNumber || typeof quotationNumber !== 'string' || !quotationNumber.trim()) {
    return NextResponse.json({ error: 'quotationNumber is required' }, { status: 400 })
  }

  try {
    const fields: Record<string, string> = {
      [PROJECTS.QUOTATION_NUMBER]: quotationNumber.trim(),
    }
    if (quotationReference && typeof quotationReference === 'string' && quotationReference.trim()) {
      fields[PROJECTS.QUOTATION_REFERENCE] = quotationReference.trim()
    }

    const updated = await updateProject(id, fields)
    return NextResponse.json({ project: updated })
  } catch (error) {
    console.error('PATCH /api/projects/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await getSession()
  if (!session || session.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const deletedTasks = await deleteTasksByProjectId(id)
    await deleteProjectById(id)
    return NextResponse.json({ deleted: true, deletedTasks })
  } catch (error) {
    console.error('DELETE /api/projects/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
  }
}
