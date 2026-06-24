import { NextRequest, NextResponse } from 'next/server'
import { verifyTempToken, createSession, setSessionCookie, getUserById } from '@/lib/auth'
import { updateUser, hashPassword } from '@/lib/db'

const MIN_LENGTH = 8
const DEFAULT_PASSWORD = process.env.DEFAULT_USER_PASSWORD ?? 'WoodWings2025!'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { tempToken, newPassword } = body as { tempToken?: string; newPassword?: string }
  if (!tempToken || !newPassword) {
    return NextResponse.json({ error: 'tempToken and newPassword are required' }, { status: 400 })
  }

  const userId = await verifyTempToken(tempToken)
  if (!userId) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  }

  if (newPassword.length < MIN_LENGTH) {
    return NextResponse.json({ error: `Password must be at least ${MIN_LENGTH} characters` }, { status: 400 })
  }
  if (newPassword === DEFAULT_PASSWORD) {
    return NextResponse.json({ error: 'You must choose a new password different from the default' }, { status: 400 })
  }

  const user = await getUserById(userId)
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const hashed = await hashPassword(newPassword)
  await updateUser(userId, { hashed_password: hashed, force_password_change: 0 })

  const sessionPayload = { id: user.id, name: user.name, email: user.email, role: user.role as import('@/lib/types').Role }
  const token = await createSession(sessionPayload)
  await setSessionCookie(token)

  return NextResponse.json({ ok: true, user: { name: user.name, role: user.role } })
}
