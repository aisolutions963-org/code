import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getNotificationsForRole, markAllReadForRole, getUnreadCountForRole } from '@/lib/notifications'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const notifications = getNotificationsForRole(session.role)
  const unreadCount = getUnreadCountForRole(session.role)
  return NextResponse.json({ notifications, unreadCount })
}

export async function PATCH() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  markAllReadForRole(session.role)
  return NextResponse.json({ ok: true })
}
