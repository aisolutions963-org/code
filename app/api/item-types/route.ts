import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getItemTypes } from '@/lib/airtable'

export async function GET() {
  const session = await getSession()
  if (!session || !['sed', 'manager', 'superadmin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const itemTypes = await getItemTypes()
    return NextResponse.json({ itemTypes })
  } catch (error) {
    console.error('GET /api/item-types error:', error)
    return NextResponse.json({ error: 'Failed to fetch item types' }, { status: 500 })
  }
}
