import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { getUserByEmail, getUserById } from './db'
import { hashPassword, verifyPassword } from './db'
import { SessionPayload, Role } from './types'

export { hashPassword, verifyPassword }

const COOKIE_NAME = 'ww_session'
export { COOKIE_NAME }

const ROLE_MAP: Record<string, Role> = {
  mgr: 'manager',
  fab: 'fabrication',
  fix: 'installation',
}

function normalizeRole(raw: string): Role {
  return ROLE_MAP[raw] ?? (raw as Role)
}

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters')
  }
  return new TextEncoder().encode(secret)
}

export async function createSession(user: SessionPayload): Promise<string> {
  return new SignJWT({ id: user.id, name: user.name, email: user.email, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecret())
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    const session = payload as unknown as SessionPayload
    return { ...session, role: normalizeRole(session.role) }
  } catch {
    return null
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifySession(token)
}

export async function login(
  email: string,
  password: string,
): Promise<SessionPayload | { requiresPasswordChange: true; tempToken: string } | null> {
  const user = await getUserByEmail(email)
  if (!user) return null
  const valid = await verifyPassword(password, user.hashed_password)
  if (!valid) return null
  if (user.force_password_change) {
    const tempToken = await new SignJWT({ userId: user.id, type: 'password_change' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(getSecret())
    return { requiresPasswordChange: true, tempToken }
  }
  return { id: user.id, name: user.name, email: user.email, role: normalizeRole(user.role) }
}

export async function verifyTempToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    if (payload.type !== 'password_change' || typeof payload.userId !== 'number') return null
    return payload.userId
  } catch {
    return null
  }
}

export { getUserById }

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies()
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24,
    path: '/',
  })
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE_NAME)
}
