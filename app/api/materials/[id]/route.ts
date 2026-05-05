import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { updateMaterialOrderStatus } from '@/lib/airtable'
import { MaterialDecisionSchema } from '@/lib/validation'

export const PATCH = requireRole('manager', 'superadmin')(
  async (req: NextRequest, _session, { params }) => {
    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = MaterialDecisionSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 },
      )
    }

    const material = await updateMaterialOrderStatus(params.id, parsed.data.orderStatus)
    return NextResponse.json({ material })
  },
)
