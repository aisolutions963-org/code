import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getNotificationsForRole, markAllReadForRole, getUnreadCountForRole } from '@/lib/notifications'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const all = req.nextUrl.searchParams.get('all') === 'true'
  const [notifications, unreadCount] = await Promise.all([
    getNotificationsForRole(session.role, all ? 9999 : 50),
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
