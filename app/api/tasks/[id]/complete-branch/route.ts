import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getTaskById } from '@/lib/airtable'
import { handleOrderSampleBranch } from '@/lib/workflow'
import { isSedAuthorizedForProject } from '@/lib/sedAccess'

export const POST = requireRole('sed', 'manager', 'superadmin')(
  async (req: NextRequest, session, { params }) => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const hasMaterial = (body as { hasMaterial?: unknown }).hasMaterial
    if (typeof hasMaterial !== 'boolean') {
      return NextResponse.json({ error: 'hasMaterial must be a boolean' }, { status: 400 })
    }

    if (session.role === 'sed') {
      const task = await getTaskById(params.id)
      const projectId = task.project?.[0]
      if (!projectId || !(await isSedAuthorizedForProject(session, projectId))) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 })
      }
    }

    try {
      const result = await handleOrderSampleBranch(params.id, hasMaterial)
      return NextResponse.json(result)
    } catch (error) {
      console.error('POST /api/tasks/[id]/complete-branch error:', error)
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed' },
        { status: 500 },
      )
    }
  },
)
