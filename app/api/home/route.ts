import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAnnouncements, getCalendarEvents } from '@/lib/airtable'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [announcements, events] = await Promise.all([
      getAnnouncements(session.role),
      getCalendarEvents(),
    ])
    return NextResponse.json({ announcements, events })
  } catch (error) {
    console.error('GET /api/home error:', error)
    return NextResponse.json({ error: 'Failed to fetch home data' }, { status: 500 })
  }
}
