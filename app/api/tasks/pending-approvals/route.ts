import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getPendingApprovalsCount } from '@/lib/airtable'

export async function GET() {
  const session = await getSession()
  if (!session || (session.role !== 'manager' && session.role !== 'superadmin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const count = await getPendingApprovalsCount()
    return NextResponse.json({ count })
  } catch (error) {
    console.error('GET /api/tasks/pending-approvals error:', error)
    return NextResponse.json({ error: 'Failed to fetch count' }, { status: 500 })
  }
}
