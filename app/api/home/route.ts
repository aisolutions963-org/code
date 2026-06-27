import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAnnouncements, getCalendarEvents } from '@/lib/airtable'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const canSeePayments = session.role === 'manager' || session.role === 'superadmin'
    const [announcements, allEvents] = await Promise.all([
      getAnnouncements(session.role),
      getCalendarEvents(),
    ])
    const events = canSeePayments
      ? allEvents
      : allEvents.filter(e => e.type !== 'payment-received' && e.type !== 'payment-due')
    return NextResponse.json({ announcements, events })
  } catch (error) {
    console.error('GET /api/home error:', error)
    return NextResponse.json({ error: 'Failed to fetch home data' }, { status: 500 })
  }
}
