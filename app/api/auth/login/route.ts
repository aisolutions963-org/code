import { NextRequest, NextResponse } from 'next/server'
import { LRUCache } from 'lru-cache'
import { login, createSession, setSessionCookie } from '@/lib/auth'
import { LoginSchema } from '@/lib/validation'

const rateLimiter = new LRUCache<string, number>({ max: 500, ttl: 1000 * 60 * 15 })
const MAX_ATTEMPTS = 5

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

export async function POST(req: NextRequest) {
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = LoginSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 },
    )
  }

  const ip = getClientIp(req)
  const attempts = rateLimiter.get(ip) ?? 0

  if (attempts >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please try again in 15 minutes.' },
      { status: 429 },
    )
  }

  const { email, password } = parsed.data
  const user = await login(email, password)
  if (!user) {
    rateLimiter.set(ip, attempts + 1)
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  rateLimiter.delete(ip)
  const token = await createSession(user)
  setSessionCookie(token)

  return NextResponse.json({ user: { name: user.name, role: user.role } })
}
