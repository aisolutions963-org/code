import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/apiHandler'
import {
  getTimesheetEntries,
  createTimesheetEntry,
  checkTimesheetDuplicate,
} from '@/lib/airtable'

export const dynamic = 'force-dynamic'

const CreateSchema = z.object({
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'workDate must be YYYY-MM-DD'),
  supervisorId: z.string().min(1, 'Supervisor is required'),
  workerIds: z.array(z.string().min(1)).default([]),
  projectIds: z.array(z.string().min(1)).default([]),
  locationType: z.enum(['Project', 'Factory']),
  regularHours: z.number().min(0).max(24),
  overtimeHours: z.number().min(0).max(24).optional().default(0),
  notes: z.string().optional(),
})

export const GET = requireRole('manager', 'superadmin')(async (req, _session) => {
  const url = new URL(req.url)
  const from = url.searchParams.get('from') ?? undefined
  const to = url.searchParams.get('to') ?? undefined
  const workerId = url.searchParams.get('workerId') ?? undefined
  const projectId = url.searchParams.get('projectId') ?? undefined
  const entries = await getTimesheetEntries({ from, to, workerId, projectId })
  return NextResponse.json({ entries })
})

export const POST = requireRole('manager', 'superadmin')(async (req) => {
  const body = await req.json()
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }
  const input = parsed.data
  const totalHours = input.regularHours + (input.overtimeHours ?? 0)

  if (totalHours > 16) {
    return NextResponse.json(
      { error: 'Total hours cannot exceed 16 hours per entry.' },
      { status: 422 },
    )
  }

  if (input.locationType === 'Project' && input.projectIds.length === 0) {
    return NextResponse.json(
      { error: 'A project must be selected when location type is Project.' },
      { status: 400 },
    )
  }

  const isDuplicate = await checkTimesheetDuplicate(
    input.supervisorId,
    input.workDate,
  )
  if (isDuplicate) {
    return NextResponse.json(
      { error: 'A timesheet entry already exists for this supervisor on this date.' },
      { status: 409 },
    )
  }

  const entry = await createTimesheetEntry(input)
  const warning = totalHours > 14 ? 'Entry logged with more than 14 hours — please verify.' : undefined
  return NextResponse.json({ entry, warning }, { status: 201 })
})
