import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getLogs } from '@/lib/logger'

export const GET = requireRole('superadmin')(async (req: NextRequest) => {
  const requestId = req.nextUrl.searchParams.get('requestId') ?? undefined
  const level = req.nextUrl.searchParams.get('level') as
    | 'info'
    | 'warn'
    | 'error'
    | undefined
  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10),
    200,
  )

  const logs = await getLogs({ requestId, level, limit })
  return NextResponse.json({ logs })
})
