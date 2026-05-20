import { NextRequest, NextResponse } from 'next/server'
import { SignJWT, jwtVerify } from 'jose'

const COOKIE_NAME = 'ww_session'
const SESSION_DURATION_SECONDS = 60 * 60 * 24 // 24 hours

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return new TextEncoder().encode(secret)
}

async function reissueToken(payload: Record<string, unknown>): Promise<string> {
  return new SignJWT({
    id: payload.id,
    name: payload.name,
    email: payload.email,
    role: payload.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecret())
}

const ROLE_TO_DASHBOARD: Record<string, string> = {
  superadmin: 'superadmin',
  manager: 'mgr',
  sed: 'sed',
  fabrication: 'fab',
  installation: 'fix',
}

export function getRoleDashboard(role: string): string {
  return ROLE_TO_DASHBOARD[role] ?? role
}

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Propagate or generate request ID on every request
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-request-id', requestId)

  function withId(res: NextResponse): NextResponse {
    res.headers.set('x-request-id', requestId)
    return res
  }

  // CSRF origin check for mutating API requests
  if (pathname.startsWith('/api') && MUTATING_METHODS.has(request.method)) {
    const origin = request.headers.get('origin')
    if (origin) {
      const appOrigin =
        process.env.NEXT_PUBLIC_BASE_URL ??
        `${request.nextUrl.protocol}//${request.nextUrl.host}`
      if (origin !== appOrigin) {
        return withId(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
      }
    }
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // Pass through non-protected paths
  if (
    !pathname.startsWith('/dashboard') &&
    !pathname.startsWith('/home') &&
    !pathname.startsWith('/admin')
  ) {
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  const token = request.cookies.get(COOKIE_NAME)?.value
  if (!token) return withId(NextResponse.redirect(new URL('/login', request.url)))

  let payload: Awaited<ReturnType<typeof jwtVerify>>['payload']
  try {
    ;({ payload } = await jwtVerify(token, getSecret()))
  } catch {
    const res = NextResponse.redirect(new URL('/login', request.url))
    res.cookies.delete(COOKIE_NAME)
    return withId(res)
  }

  const role = payload.role as string

  // Role check for /admin — superadmin only
  if (pathname.startsWith('/admin') && role !== 'superadmin') {
    return withId(NextResponse.redirect(new URL('/dashboard/superadmin', request.url)))
  }

  // Role-to-segment enforcement for /dashboard
  if (pathname.startsWith('/dashboard') && role !== 'superadmin') {
    const dashboardSegment = getRoleDashboard(role)
    const requestedSegment = pathname.split('/')[2]
    if (requestedSegment && requestedSegment !== dashboardSegment) {
      return withId(
        NextResponse.redirect(new URL(`/dashboard/${dashboardSegment}`, request.url)),
      )
    }
  }

  // Rolling session — re-issue the cookie on every valid request so active users
  // never get logged out mid-session.
  const newToken = await reissueToken(payload as Record<string, unknown>)
  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.cookies.set(COOKIE_NAME, newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION_SECONDS,
    path: '/',
  })
  return withId(res)
}

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*', '/home', '/admin/:path*'],
}
