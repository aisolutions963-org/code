import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { createMaterialOrder } from '@/lib/airtable'
import { CreateMaterialOrderSchema } from '@/lib/validation'

export const POST = requireRole('sed', 'manager', 'fabrication', 'superadmin')(
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

    const today = new Date().toISOString().slice(0, 10)

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
