import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getAnnouncements, createAnnouncement } from '@/lib/airtable'
import { CreateAnnouncementSchema } from '@/lib/validation'

export const GET = requireRole()(async (_req: NextRequest, session) => {
  const announcements = await getAnnouncements(session.role)
  return NextResponse.json({ announcements })
})

export const POST = requireRole('superadmin')(async (req: NextRequest) => {
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = CreateAnnouncementSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 },
    )
  }

  const announcement = await createAnnouncement(parsed.data)
  return NextResponse.json({ announcement }, { status: 201 })
})
