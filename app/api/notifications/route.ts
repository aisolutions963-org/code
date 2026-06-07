import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  getNotificationsForRole,
  getUnreadCountForRole,
  markAllReadForRole,
} from '@/lib/notifications'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const all = req.nextUrl.searchParams.get('all') === 'true'
  const limit = all ? 9999 : 50

  const [notifications, unreadCount] = await Promise.all([
    getNotificationsForRole(session.role, limit),
    getUnreadCountForRole(session.role),
  ])
  return NextResponse.json({ notifications, unreadCount })
}

export async function PATCH() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await markAllReadForRole(session.role)
  return NextResponse.json({ ok: true })
}
