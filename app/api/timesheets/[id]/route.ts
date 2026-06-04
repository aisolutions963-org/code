import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/apiHandler'
import { updateTimesheetEntry, deleteTimesheetEntry, getTimesheetEntryById } from '@/lib/airtable'

export const dynamic = 'force-dynamic'

const UpdateSchema = z.object({
  regularHours: z.number().min(0).max(24).optional(),
  overtimeHours: z.number().min(0).max(24).optional(),
  notes: z.string().optional(),
})

type Context = { params: { id: string } }

export const PATCH = requireRole<Context>('manager', 'superadmin')(async (req, _session, ctx) => {
  const { id } = ctx.params
  const body = await req.json()
  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }
  const input = parsed.data
  if (input.regularHours !== undefined || input.overtimeHours !== undefined) {
    const existing = await getTimesheetEntryById(id)
    const reg = input.regularHours ?? existing.regularHours
    const ot = input.overtimeHours ?? existing.overtimeHours
    if (reg + ot > 16) {
      return NextResponse.json(
        { error: 'Total hours cannot exceed 16 hours per entry.' },
        { status: 422 },
      )
    }
  }
  const entry = await updateTimesheetEntry(id, input)
  return NextResponse.json({ entry })
})

export const DELETE = requireRole<Context>('superadmin')(async (_req, _session, ctx) => {
  const { id } = ctx.params
  await deleteTimesheetEntry(id)
  return NextResponse.json({ success: true })
})
