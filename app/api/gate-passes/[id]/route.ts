import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { updateGatePass } from '@/lib/airtable'

export const PATCH = requireRole('manager', 'superadmin')(
  async (req: NextRequest, _session, context) => {
    const id = context.params.id
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const allowed = ['gatePassStatus', 'confirmedDeliveryDate', 'siteReady', 'clientNotified']
    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
    }

    try {
      await updateGatePass(id, updates as Parameters<typeof updateGatePass>[1])
      return NextResponse.json({ ok: true })
    } catch (err) {
      console.error('PATCH /api/gate-passes/[id] error:', err)
      return NextResponse.json({ error: 'Failed to update gate pass' }, { status: 500 })
    }
  },
) as (req: NextRequest, ...args: unknown[]) => Promise<NextResponse>
