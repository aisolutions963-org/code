import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { createHandoverSheet } from '@/lib/airtable'
import { CreateHandoverSchema } from '@/lib/validation'

export const POST = requireRole('installation', 'manager', 'superadmin')(
  async (req: NextRequest, _session, { params }) => {
    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      rawBody = {}
    }

    const parsed = CreateHandoverSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 },
      )
    }

    try {
      const sheet = await createHandoverSheet(params.id, parsed.data.notes)
      return NextResponse.json({ sheet })
    } catch (error) {
      console.error('POST /api/projects/[id]/handover error:', error)
      return NextResponse.json({ error: 'Failed to create handover sheet' }, { status: 500 })
    }
  },
)
