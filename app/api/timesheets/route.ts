import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/apiHandler'
import {
  getTimesheetEntries,
  createTimesheetEntries,
  createTimesheetStatusEntry,
  getWorkerAssignmentsForDate,
} from '@/lib/airtable'

export const dynamic = 'force-dynamic'

const WorkSchema = z.object({
  mode: z.literal('work'),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'workDate must be YYYY-MM-DD'),
  supervisorId: z.string().min(1, 'Supervisor is required'),
  projectIds: z.array(z.string().min(1)).default([]),
  locationType: z.enum(['Project', 'Factory']),
  workers: z.array(z.object({
    workerId: z.string().min(1),
    regularHours: z.number().min(0).max(24),
    overtimeHours: z.number().min(0).max(24).optional().default(0),
  })).min(1, 'At least one worker is required'),
  notes: z.string().optional(),
})

const StatusSchema = z.object({
  mode: z.literal('status'),
  workerId: z.string().min(1),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'workDate must be YYYY-MM-DD'),
  status: z.enum(['Holiday', 'Absent']),
  notes: z.string().optional(),
})

const CreateSchema = z.discriminatedUnion('mode', [WorkSchema, StatusSchema])

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

  if (input.mode === 'status') {
    const assignments = await getWorkerAssignmentsForDate(input.workDate)
    const existing = assignments.get(input.workerId)
    if (existing) {
      return NextResponse.json(
        { error: `This worker is already marked "${existing.label}" on this date.` },
        { status: 409 },
      )
    }
    const entry = await createTimesheetStatusEntry({
      workerId: input.workerId,
      workDate: input.workDate,
      status: input.status,
      notes: input.notes,
    })
    return NextResponse.json({ entry }, { status: 201 })
  }

  if (input.locationType === 'Project' && input.projectIds.length === 0) {
    return NextResponse.json(
      { error: 'A project must be selected when location type is Project.' },
      { status: 400 },
    )
  }

  const overCap = input.workers.find((w) => w.regularHours + (w.overtimeHours ?? 0) > 16)
  if (overCap) {
    return NextResponse.json(
      { error: 'Total hours cannot exceed 16 hours per worker.' },
      { status: 422 },
    )
  }

  const assignments = await getWorkerAssignmentsForDate(input.workDate)
  const conflicts = input.workers
    .map((w) => ({ workerId: w.workerId, existing: assignments.get(w.workerId) }))
    .filter((c) => c.existing)
  if (conflicts.length > 0) {
    return NextResponse.json(
      {
        error: `${conflicts.length} worker(s) are already assigned on this date: ${conflicts
          .map((c) => `${c.workerId} (${c.existing!.label})`)
          .join(', ')}`,
      },
      { status: 409 },
    )
  }

  const entries = await createTimesheetEntries(input)
  const anyOver14 = input.workers.some((w) => w.regularHours + (w.overtimeHours ?? 0) > 14)
  const warning = anyOver14 ? 'One or more workers logged more than 14 hours — please verify.' : undefined
  return NextResponse.json({ entries, warning }, { status: 201 })
})
