import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const COOKIE_NAME = 'ww_session'

function getSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.SESSION_SECRET ?? 'fallback-secret-must-replace')
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

  // Auth for /admin — superadmin only
  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get(COOKIE_NAME)?.value
    if (!token) return withId(NextResponse.redirect(new URL('/login', request.url)))
    try {
      const { payload } = await jwtVerify(token, getSecret())
      if (payload.role !== 'superadmin') {
        return withId(NextResponse.redirect(new URL('/dashboard/superadmin', request.url)))
      }
      return NextResponse.next({ request: { headers: requestHeaders } })
    } catch {
      const res = NextResponse.redirect(new URL('/login', request.url))
      res.cookies.delete(COOKIE_NAME)
      return withId(res)
    }
  }

  // Auth for /home
  if (pathname.startsWith('/home')) {
    const token = request.cookies.get(COOKIE_NAME)?.value
    if (!token) return withId(NextResponse.redirect(new URL('/login', request.url)))
    try {
      await jwtVerify(token, getSecret())
      return NextResponse.next({ request: { headers: requestHeaders } })
    } catch {
      const res = NextResponse.redirect(new URL('/login', request.url))
      res.cookies.delete(COOKIE_NAME)
      return withId(res)
    }
  }

  // Auth for /dashboard
  const token = request.cookies.get(COOKIE_NAME)?.value
  if (!token) return withId(NextResponse.redirect(new URL('/login', request.url)))

  try {
    const { payload } = await jwtVerify(token, getSecret())
    const role = payload.role as string
    const dashboardSegment = getRoleDashboard(role)

    if (role === 'superadmin') {
      return NextResponse.next({ request: { headers: requestHeaders } })
    }

    const segments = pathname.split('/')
    const requestedSegment = segments[2]
    if (requestedSegment && requestedSegment !== dashboardSegment) {
      return withId(
        NextResponse.redirect(new URL(`/dashboard/${dashboardSegment}`, request.url)),
      )
    }

    return NextResponse.next({ request: { headers: requestHeaders } })
  } catch {
    const res = NextResponse.redirect(new URL('/login', request.url))
    res.cookies.delete(COOKIE_NAME)
    return withId(res)
  }
}

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*', '/home', '/admin/:path*'],
}
