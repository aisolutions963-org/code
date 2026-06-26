import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getCalendarEvents } from '@/lib/airtable'

export const GET = requireRole('manager', 'superadmin')(async (req: NextRequest) => {
  const date = req.nextUrl.searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date query param required (YYYY-MM-DD)' }, { status: 400 })
  }
  try {
    const all = await getCalendarEvents()
    const busyMemberIds = new Set<string>()
    for (const e of all) {
      if (e.date === date && e.type === 'fabrication' && e.teamMemberIds?.length) {
        for (const id of e.teamMemberIds) busyMemberIds.add(id)
      }
    }
    return NextResponse.json({ busyMemberIds: Array.from(busyMemberIds) })
  } catch (error) {
    console.error('GET /api/calendar/conflicts error:', error)
    return NextResponse.json({ error: 'Failed to check conflicts' }, { status: 500 })
  }
})
