import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { handleF3Order } from '@/lib/workflow'

export const POST = requireRole('manager', 'superadmin')(
  async (req: NextRequest, session, { params }) => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { path, items, generalNotes } = body as {
      path?: unknown
      items?: unknown
      generalNotes?: unknown
    }

    if (path !== 'small' && path !== 'big') {
      return NextResponse.json({ error: 'path must be "small" or "big"' }, { status: 400 })
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one material item is required' }, { status: 400 })
    }

    for (const item of items as Array<Record<string, unknown>>) {
      if (!item.name || typeof item.name !== 'string') {
        return NextResponse.json({ error: 'Each item must have a name' }, { status: 400 })
      }
      if (!item.quantity || typeof item.quantity !== 'number' || item.quantity <= 0) {
        return NextResponse.json({ error: `Item "${item.name}": quantity must be a positive number` }, { status: 400 })
      }
      if (!item.unit || typeof item.unit !== 'string') {
        return NextResponse.json({ error: `Item "${item.name}": unit is required` }, { status: 400 })
      }
    }

    try {
      const result = await handleF3Order({
        taskId: params.id,
        path: path as 'small' | 'big',
        items: items as Array<{ name: string; quantity: number; unit: string; supplier?: string; neededByDate?: string; notes?: string }>,
        generalNotes: typeof generalNotes === 'string' ? generalNotes : undefined,
        requestedBy: session.name,
      })
      return NextResponse.json(result, { status: 201 })
    } catch (error) {
      console.error('POST /api/tasks/[id]/f3-order error:', error)
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed' },
        { status: 500 },
      )
    }
  },
)
