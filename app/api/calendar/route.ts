import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getCalendarEvents, createCalendarEvent } from '@/lib/airtable'
import { CreateCalendarEventSchema } from '@/lib/validation'
import { getUserByAirtableMemberId, getUserById } from '@/lib/db'
import { createNotification } from '@/lib/notifications'

const PAYMENT_EVENT_TYPES = new Set(['payment-due', 'payment-received'])
const REVIEW_TASK_PREFIXES = ['weekly-review:', 'monthly-audit:']

export const GET = requireRole('manager', 'superadmin', 'sed', 'installation', 'fabrication')(async (req: NextRequest, session) => {
  try {
    const all = await getCalendarEvents()
    const mine = req.nextUrl.searchParams.get('mine') === 'true'
    if (mine && session.role === 'installation') {
      const dbUser = await getUserById(session.id)
      const memberId = dbUser?.airtable_member_id
      const events = memberId ? all.filter((e) => e.teamMemberIds?.includes(memberId)) : []
      return NextResponse.json({ events })
    }
    const canSeePayments = session.role === 'manager' || session.role === 'superadmin'
    const events = canSeePayments
      ? all
      : all.filter((e) =>
          !PAYMENT_EVENT_TYPES.has(e.type) &&
          !REVIEW_TASK_PREFIXES.some((p) => e.customTask?.startsWith(p))
        )
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
    await createCalendarEvent({ ...eventData, createdBy: session.name, teamMemberIds })

    if (teamMemberIds && teamMemberIds.length > 0 &&
        (parsed.data.eventType === 'fabrication' || parsed.data.eventType === 'installation')) {
      const isInstall  = parsed.data.eventType === 'installation'
      // Recipient is always the installation role (Arabic dashboard) → Arabic text.
      const notifTitle = isInstall
        ? `تم إسناد التركيب — ${parsed.data.title}`
        : `تم إسناد عمل المصنع — ${parsed.data.title}`
      const notifBody  = `${parsed.data.date} — بواسطة ${session.name}`
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
