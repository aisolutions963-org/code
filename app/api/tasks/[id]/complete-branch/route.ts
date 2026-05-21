import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { handleOrderSampleBranch } from '@/lib/workflow'

export const POST = requireRole('sed', 'manager', 'superadmin')(
  async (req: NextRequest, _session, { params }) => {
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
