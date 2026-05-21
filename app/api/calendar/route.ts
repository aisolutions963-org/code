import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getCalendarEvents, createCalendarEvent } from '@/lib/airtable'
import { CreateCalendarEventSchema } from '@/lib/validation'

export const GET = requireRole('manager', 'superadmin', 'sed', 'installation', 'fabrication')(async () => {
  try {
    const events = await getCalendarEvents()
    return NextResponse.json({ events })
  } catch (error) {
    console.error('GET /api/calendar error:', error)
    return NextResponse.json({ error: 'Failed to fetch calendar events' }, { status: 500 })
  }
})

export const POST = requireRole('manager', 'superadmin', 'sed', 'installation', 'fabrication')(async (req, session) => {
  try {
    const body = await req.json()
    const parsed = CreateCalendarEventSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }
    await createCalendarEvent({ ...parsed.data, createdBy: session.name })
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    console.error('POST /api/calendar error:', error)
    return NextResponse.json({ error: 'Failed to create calendar event' }, { status: 500 })
  }
})
