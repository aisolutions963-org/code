import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { createInstallationLog, getInstallationLogsByProject } from '@/lib/airtable'

export const dynamic = 'force-dynamic'

export const GET = requireRole()(async (req: NextRequest) => {
  const projectRecordId = req.nextUrl.searchParams.get('projectRecordId')
  if (!projectRecordId) {
    return NextResponse.json({ error: 'projectRecordId query param required' }, { status: 400 })
  }
  const logs = await getInstallationLogsByProject(projectRecordId)
  return NextResponse.json({ logs })
})

export const POST = requireRole('installation', 'manager', 'superadmin')(
  async (req: NextRequest, session) => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { projectRecordId, date, workDescription, numberOfLaborers } = body as {
      projectRecordId?: string
      date?: string
      workDescription?: string
      numberOfLaborers?: number
    }

    if (!projectRecordId || !date) {
      return NextResponse.json({ error: 'projectRecordId and date are required' }, { status: 400 })
    }

    const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
    if (!isoDate) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
    }

    const log = await createInstallationLog({
      project: [projectRecordId],
      date: isoDate,
      numberOfLaborers: typeof numberOfLaborers === 'number' && numberOfLaborers > 0 ? numberOfLaborers : undefined,
      workDescription: typeof workDescription === 'string' && workDescription.trim() ? workDescription.trim() : undefined,
      recordedBy: session.name,
    })

    return NextResponse.json({ log }, { status: 201 })
  },
)
