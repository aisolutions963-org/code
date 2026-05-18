import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { markNotificationRead } from '@/lib/notifications'

export async function PATCH(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = parseInt(params.id)
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  markNotificationRead(id)
  return NextResponse.json({ ok: true })
}
