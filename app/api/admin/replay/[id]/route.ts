import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { markReplayed } from '@/lib/failedRequests'

export const POST = requireRole('superadmin')(
  async (req: NextRequest, _session, { params }) => {
    let body: { result: string } = { result: '' }
    try {
      body = await req.json()
    } catch {
      // result is optional
    }

    await markReplayed(params.id, body.result || 'Replayed by admin')
    return NextResponse.json({ success: true })
  },
)
