import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getCalendarEvents, deleteCalendarEvent, updateCalendarEvent } from '@/lib/airtable'
import { UpdateCalendarEventSchema } from '@/lib/validation'

export const DELETE = requireRole('manager', 'superadmin', 'sed', 'installation', 'fabrication')(
  async (_req, _session, { params }) => {
    try {
      // Re-derive the event list to verify this id is a genuine, standalone custom event —
      // never a task/payment/fabrication/installation-log-derived one, which would silently
      // reappear (or worse, leave a confusing gap) since the underlying record still exists.
      const all = await getCalendarEvents()
      const event = all.find((e) => e.id === params.id)
      if (!event) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 })
      }
      if (event.source !== 'custom') {
        return NextResponse.json(
          { error: 'Only custom events can be deleted — this one is derived from a task, payment, or log.' },
          { status: 400 },
        )
      }
      await deleteCalendarEvent(params.id)
      return NextResponse.json({ ok: true })
    } catch (error) {
      console.error('DELETE /api/calendar/[id] error:', error)
      return NextResponse.json({ error: 'Failed to delete calendar event' }, { status: 500 })
    }
  },
)

export const PATCH = requireRole('manager', 'superadmin')(
  async (req: NextRequest, _session, { params }) => {
    try {
      const all = await getCalendarEvents()
      const event = all.find((e) => e.id === params.id)
      if (!event) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 })
      }
      if (event.source !== 'custom') {
        return NextResponse.json(
          { error: 'Only custom events can be edited — this one is derived from a task, payment, or log.' },
          { status: 400 },
        )
      }

      let rawBody: unknown
      try {
        rawBody = await req.json()
      } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
      }
      const parsed = UpdateCalendarEventSchema.safeParse(rawBody)
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
          { status: 400 },
        )
      }

      await updateCalendarEvent(params.id, parsed.data)
      return NextResponse.json({ ok: true })
    } catch (error) {
      console.error('PATCH /api/calendar/[id] error:', error)
      return NextResponse.json({ error: 'Failed to update calendar event' }, { status: 500 })
    }
  },
)
