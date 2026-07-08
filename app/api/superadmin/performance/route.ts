import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getRolePerformance } from '@/lib/airtable'

export const dynamic = 'force-dynamic'

export const GET = requireRole('superadmin')(async () => {
  try {
    const byDepartment = await getRolePerformance()
    return NextResponse.json({ byDepartment })
  } catch (error) {
    console.error('GET /api/superadmin/performance error:', error)
    return NextResponse.json({ error: 'Failed to load performance' }, { status: 500 })
  }
})
