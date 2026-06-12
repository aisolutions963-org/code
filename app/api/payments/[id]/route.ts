import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { updatePayment } from '@/lib/airtable'
import { UpdatePaymentSchema } from '@/lib/validation'

export const PATCH = requireRole('superadmin')(
  async (req: NextRequest, _session, context) => {
    const { id } = (context as { params: { id: string } }).params

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = UpdatePaymentSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 },
      )
    }

    try {
      const payment = await updatePayment(id, parsed.data)
      return NextResponse.json({ payment })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update payment'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  },
)
