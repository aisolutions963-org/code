import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { createMaterialOrder, getAllActiveMaterials } from '@/lib/airtable'
import { CreateMaterialOrderSchema } from '@/lib/validation'
import { todayUAE } from '@/lib/dateUtils'

export const GET = requireRole('manager', 'superadmin', 'sed', 'fabrication', 'installation')(async () => {
  const materials = await getAllActiveMaterials()
  const pendingCount = materials.filter(
    (m) => m.orderStatus === 'Not ordered' || m.orderStatus === 'Pending approval',
  ).length
  return NextResponse.json({ materials, pendingCount })
})

export const POST = requireRole('sed', 'manager', 'fabrication', 'installation', 'superadmin')(
  async (req: NextRequest, session) => {
    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = CreateMaterialOrderSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 },
      )
    }

    const today = todayUAE()

    try {
      const materials = await createMaterialOrder({
        purpose: parsed.data.purpose,
        projectId: parsed.data.projectId,
        requestedBy: session.name,
        requestDate: today,
        items: parsed.data.items,
      })
      return NextResponse.json({ created: materials.length, materials })
    } catch (error) {
      console.error('POST /api/materials error:', error)
      return NextResponse.json({ error: 'Failed to create material order' }, { status: 500 })
    }
  },
)
