import { NextRequest, NextResponse } from 'next/server'
import { getSession } from './auth'
import { SessionPayload } from './types'
import { log } from './logger'
import { recordRequest } from './metrics'
import { storeFailedRequest } from './failedRequests'
import { startMetricsSnapshots } from './metricsSnapshot'

// Start periodic metrics snapshot on first API handler import
startMetricsSnapshots()

export class AirtableError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message)
    this.name = 'AirtableError'
  }
}

type RouteContext = { params: Record<string, string> }
type RawRouteContext = { params: Promise<Record<string, string>> | Record<string, string> }
type AuthedHandler<C = RouteContext> = (
  req: NextRequest,
  session: SessionPayload,
  context: C,
) => Promise<NextResponse>

function buildError(req: NextRequest, error: unknown, requestId: string): NextResponse {
  const message = error instanceof Error ? error.message : 'Unknown error'
  console.error('[API Error]', { url: req.url, method: req.method, error: message, requestId })
  if (error instanceof AirtableError) {
    return NextResponse.json(
      { error: 'Service temporarily unavailable. Please try again.' },
      { status: 503 },
    )
  }
  return NextResponse.json(
    { error: 'An unexpected error occurred. Please try again.', requestId },
    { status: 500 },
  )
}

export function requireRole<C = RouteContext>(...roles: string[]) {
  return function (handler: AuthedHandler<C>) {
    return async function (req: NextRequest, rawContext: RawRouteContext): Promise<NextResponse> {
      const resolvedParams = rawContext.params instanceof Promise ? await rawContext.params : rawContext.params
      const context = { params: resolvedParams } as unknown as C
      const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID()
      const start = Date.now()

      // Clone body before handler consumes it (for failure storage on error)
      let inputPayload: unknown
      if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
        inputPayload = await req.clone().json().catch(() => undefined)
      }

      try {
        const session = await getSession()
        if (!session) {
          recordRequest(Date.now() - start, false)
          // Auth failures are worth persisting — low frequency, high signal
          log({
            requestId,
            level: 'warn',
            event: 'AUTH_FAILURE_UNAUTHENTICATED',
            metadata: { method: req.method, path: new URL(req.url).pathname },
          })
          return NextResponse.json(
            { error: 'Unauthorized', requestId },
            { status: 401 },
          )
        }
        if (roles.length > 0 && !roles.includes(session.role)) {
          recordRequest(Date.now() - start, false)
          log({
            requestId,
            level: 'warn',
            event: 'AUTH_FAILURE_FORBIDDEN',
            userId: String(session.id),
            metadata: {
              method: req.method,
              path: new URL(req.url).pathname,
              role: session.role,
              required: roles,
            },
          })
          return NextResponse.json(
            { error: 'Forbidden', requestId },
            { status: 403 },
          )
        }

        const response = await handler(req, session, context)
        const durationMs = Date.now() - start
        const success = response.status < 400

        recordRequest(durationMs, success)

        // Runtime log only (console) — NOT persisted to Airtable for successful requests
        console.log(
          `[INFO] [${requestId}] ${req.method} ${new URL(req.url).pathname} ${response.status} ${durationMs}ms`,
        )

        const newRes = new NextResponse(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        })
        newRes.headers.set('x-request-id', requestId)
        return newRes
      } catch (error) {
        const durationMs = Date.now() - start
        const message = error instanceof Error ? error.message : 'Unknown error'
        const pathname = new URL(req.url).pathname

        recordRequest(durationMs, false)

        // Errors ARE persisted to Airtable — this is the "low frequency, critical" case
        log({
          requestId,
          level: 'error',
          event: `UNHANDLED_ERROR: ${req.method} ${pathname}`,
          durationMs,
          metadata: { error: message },
        })
        storeFailedRequest({
          requestId,
          endpoint: pathname,
          method: req.method,
          event: 'UNHANDLED_ERROR',
          errorMessage: message,
          statusCode: 500,
          inputPayload,
        })

        const errRes = buildError(req, error, requestId)
        errRes.headers.set('x-request-id', requestId)
        return errRes
      }
    }
  }
}

export function withErrorHandling<C = RouteContext>(
  handler: (req: NextRequest, context: C) => Promise<NextResponse>,
) {
  return async function (req: NextRequest, rawContext: RawRouteContext): Promise<NextResponse> {
    const resolvedParams = rawContext.params instanceof Promise ? await rawContext.params : rawContext.params
    const context = { params: resolvedParams } as unknown as C
    const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID()
    const start = Date.now()
    try {
      const response = await handler(req, context)
      recordRequest(Date.now() - start, response.status < 400)
      return response
    } catch (error) {
      recordRequest(Date.now() - start, false)
      return buildError(req, error, requestId)
    }
  }
}
