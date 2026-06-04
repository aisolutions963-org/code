import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  getNotificationsForUser,
  getUnreadCountForUser,
  markAllReadForUser,
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

  const notifications = getNotificationsForUser(session.role, session.id, limit)
  const unreadCount = getUnreadCountForUser(session.role, session.id)
  return NextResponse.json({ notifications, unreadCount })
}

export async function PATCH() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  markAllReadForUser(session.role, session.id)
  return NextResponse.json({ ok: true })
}
