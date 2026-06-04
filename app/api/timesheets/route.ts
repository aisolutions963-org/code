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
  workerIds: z.array(z.string().min(1)).min(1, 'At least one worker required'),
  projectIds: z.array(z.string().min(1)).min(1, 'At least one project required'),
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

  const isDuplicate = await checkTimesheetDuplicate(
    input.workerIds[0],
    input.projectIds[0],
    input.workDate,
  )
  if (isDuplicate) {
    return NextResponse.json(
      { error: 'A timesheet entry already exists for this worker, project, and date.' },
      { status: 409 },
    )
  }

  const entry = await createTimesheetEntry(input)
  const warning = totalHours > 14 ? 'Entry logged with more than 14 hours — please verify.' : undefined
  return NextResponse.json({ entry, warning }, { status: 201 })
})
