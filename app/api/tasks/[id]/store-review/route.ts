import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { handleStoreReview } from '@/lib/workflow'

export const POST = requireRole('fabrication', 'manager', 'superadmin')(
  async (req: NextRequest, session, { params }) => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { notes } = body as { notes?: unknown }

    if (!notes || typeof notes !== 'string' || !notes.trim()) {
      return NextResponse.json({ error: 'Review notes are required' }, { status: 400 })
    }

    try {
      const result = await handleStoreReview({
        taskId: params.id,
        notes: notes.trim(),
        submittedBy: session.name,
      })
      return NextResponse.json(result, { status: 200 })
    } catch (error) {
      console.error('POST /api/tasks/[id]/store-review error:', error)
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed' },
        { status: 500 },
      )
    }
  },
)
