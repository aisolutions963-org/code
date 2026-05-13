import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getCalendarEvents } from '@/lib/airtable'

export const GET = requireRole('manager', 'superadmin')(async () => {
  try {
    const events = await getCalendarEvents()
    return NextResponse.json({ events })
  } catch (error) {
    console.error('GET /api/calendar error:', error)
    return NextResponse.json({ error: 'Failed to fetch calendar events' }, { status: 500 })
  }
})
