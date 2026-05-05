import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { updateAnnouncement, deleteAnnouncement } from '@/lib/airtable'
import { UpdateAnnouncementSchema } from '@/lib/validation'

export const PATCH = requireRole('superadmin')(
  async (req: NextRequest, _session, { params }) => {
    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = UpdateAnnouncementSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 },
      )
    }

    const announcement = await updateAnnouncement(params.id, parsed.data)
    return NextResponse.json({ announcement })
  },
)

export const DELETE = requireRole('superadmin')(
  async (_req: NextRequest, _session, { params }) => {
    await deleteAnnouncement(params.id)
    return NextResponse.json({ success: true })
  },
)
