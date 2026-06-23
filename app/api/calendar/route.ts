import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getCalendarEvents, createCalendarEvent } from '@/lib/airtable'
import { CreateCalendarEventSchema } from '@/lib/validation'
import { getUserByAirtableMemberId } from '@/lib/db'
import { createNotification } from '@/lib/notifications'

const PAYMENT_EVENT_TYPES = new Set(['payment-due', 'payment-received'])

export const GET = requireRole('manager', 'superadmin', 'sed', 'installation', 'fabrication')(async (_req, session) => {
  try {
    const all = await getCalendarEvents()
    const canSeePayments = session.role === 'manager' || session.role === 'superadmin'
    const events = canSeePayments ? all : all.filter((e) => !PAYMENT_EVENT_TYPES.has(e.type))
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
    const { teamMemberIds, ...eventData } = parsed.data
    await createCalendarEvent({ ...eventData, createdBy: session.name })

    if (teamMemberIds && teamMemberIds.length > 0 &&
        (parsed.data.eventType === 'fabrication' || parsed.data.eventType === 'installation')) {
      const isInstall  = parsed.data.eventType === 'installation'
      const notifTitle = isInstall
        ? `Installation assigned — ${parsed.data.title}`
        : `Factory work assigned — ${parsed.data.title}`
      const notifBody  = `${parsed.data.date} — Assigned by ${session.name}`
      await Promise.all(
        teamMemberIds.map(async (airtableId) => {
          const user = await getUserByAirtableMemberId(airtableId)
          await createNotification({
            recipientRole: 'installation',
            recipientUserId: user?.id,
            title: notifTitle,
            body: notifBody,
            link: '/dashboard/fix?view=calendar',
          })
        }),
      )
    }

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    console.error('POST /api/calendar error:', error)
    return NextResponse.json({ error: 'Failed to create calendar event' }, { status: 500 })
  }
})
