import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { getUserByEmail } from './db'
import { hashPassword, verifyPassword } from './db'
import { SessionPayload, Role } from './types'

export { hashPassword, verifyPassword }

const COOKIE_NAME = 'ww_session'
export { COOKIE_NAME }

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
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifySession(token)
}

export async function login(email: string, password: string): Promise<SessionPayload | null> {
  const user = getUserByEmail(email)
  if (!user) return null
  const valid = await verifyPassword(password, user.hashed_password)
  if (!valid) return null
  return { id: user.id, name: user.name, email: user.email, role: user.role as Role }
}

export function setSessionCookie(token: string): void {
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: '/',
  })
}

export function clearSessionCookie(): void {
  cookies().delete(COOKIE_NAME)
}
