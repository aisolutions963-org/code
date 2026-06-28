import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getCalendarProjects } from '@/lib/airtable'

export const dynamic = 'force-dynamic'

export const GET = requireRole('manager', 'superadmin', 'sed', 'installation', 'fabrication')(async () => {
  try {
    const projects = await getCalendarProjects()
    return NextResponse.json({ projects })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load projects'
    console.error('[calendar/projects]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}) as () => Promise<NextResponse>
