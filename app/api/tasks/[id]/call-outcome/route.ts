import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getTaskById } from '@/lib/airtable'
import { handleCallClientOutcome } from '@/lib/workflow'

const VALID_OUTCOMES = new Set(['approved', 'review', 'refused'])

export const POST = requireRole('superadmin')(
  async (req: NextRequest, _session, { params }) => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const outcome = (body as { outcome?: unknown }).outcome
    if (typeof outcome !== 'string' || !VALID_OUTCOMES.has(outcome)) {
      return NextResponse.json(
        { error: 'outcome must be one of: approved, review, refused' },
        { status: 400 },
      )
    }

    try {
      await handleCallClientOutcome(params.id, outcome as 'approved' | 'review' | 'refused')
      const task = await getTaskById(params.id)
      return NextResponse.json({ task, outcome })
    } catch (error) {
      console.error('POST /api/tasks/[id]/call-outcome error:', error)
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to record outcome' },
        { status: 500 },
      )
    }
  },
)
