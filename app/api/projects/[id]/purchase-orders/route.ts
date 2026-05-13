import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getPurchaseOrdersByProject, createPurchaseOrder } from '@/lib/airtable'
import { CreatePurchaseOrderSchema } from '@/lib/validation'

export const GET = requireRole('manager', 'superadmin')(
  async (_req: NextRequest, _session, { params }) => {
    try {
      const purchaseOrders = await getPurchaseOrdersByProject(params.id)
      return NextResponse.json({ purchaseOrders })
    } catch (error) {
      console.error('GET /api/projects/[id]/purchase-orders error:', error)
      return NextResponse.json({ error: 'Failed to fetch purchase orders' }, { status: 500 })
    }
  },
)

export const POST = requireRole('manager', 'superadmin')(
  async (req: NextRequest, _session, { params }) => {
    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = CreatePurchaseOrderSchema.safeParse({ ...(rawBody as Record<string, unknown>), project: [params.id] })
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 },
      )
    }

    try {
      const purchaseOrder = await createPurchaseOrder(parsed.data)
      return NextResponse.json({ purchaseOrder }, { status: 201 })
    } catch (error) {
      console.error('POST /api/projects/[id]/purchase-orders error:', error)
      return NextResponse.json({ error: 'Failed to create purchase order' }, { status: 500 })
    }
  },
)
