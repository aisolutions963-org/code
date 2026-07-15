import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getInstallationLogsByProject, createInstallationLog } from '@/lib/airtable'
import { CreateInstallationLogSchema } from '@/lib/validation'

export const GET = requireRole('installation', 'manager', 'superadmin')(
  async (req: NextRequest, _session, { params }) => {
    try {
      const itemId = new URL(req.url).searchParams.get('itemId')
      const logs = await getInstallationLogsByProject(params.id, itemId ?? undefined)
      return NextResponse.json({ logs })
    } catch (error) {
      console.error('GET /api/projects/[id]/installation-logs error:', error)
      return NextResponse.json({ error: 'Failed to fetch installation logs' }, { status: 500 })
    }
  },
)

export const POST = requireRole('installation', 'manager', 'superadmin')(
  async (req: NextRequest, _session, { params }) => {
    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = CreateInstallationLogSchema.safeParse({ ...(rawBody as Record<string, unknown>), project: [params.id] })
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 },
      )
    }

    try {
      const log = await createInstallationLog(parsed.data)
      return NextResponse.json({ log }, { status: 201 })
    } catch (error) {
      console.error('POST /api/projects/[id]/installation-logs error:', error)
      return NextResponse.json({ error: 'Failed to create installation log' }, { status: 500 })
    }
  },
)
