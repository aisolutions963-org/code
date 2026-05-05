import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getTaskById, updateTask } from '@/lib/airtable'
import { canEditField, filterAllowedFields } from '@/lib/permissions'
import {
  handleTaskCompletion,
  handleManagerApproval,
  handleManagerRejection,
} from '@/lib/workflow'
import { TaskUpdateInput } from '@/lib/types'
import { UpdateTaskSchema } from '@/lib/validation'

export const GET = requireRole()(
  async (_req: NextRequest, _session, { params }) => {
    const task = await getTaskById(params.id)
    return NextResponse.json({ task })
  },
)

export const PATCH = requireRole()(
  async (req: NextRequest, session, { params }) => {
    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    let fields: Partial<TaskUpdateInput>
    if (
      rawBody !== null &&
      typeof rawBody === 'object' &&
      'fields' in (rawBody as object)
    ) {
      const parsed = UpdateTaskSchema.safeParse((rawBody as { fields: unknown }).fields)
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
          { status: 400 },
        )
      }
      fields = parsed.data
    } else {
      return NextResponse.json({ error: 'fields object required' }, { status: 400 })
    }

    for (const key of Object.keys(fields)) {
      if (!canEditField(session.role, key)) {
        return NextResponse.json(
          { error: `Role '${session.role}' cannot edit field '${key}'` },
          { status: 403 },
        )
      }
    }

    const { status, managerReviewStatus, ...otherFields } = fields as Partial<TaskUpdateInput>

    if (Object.keys(otherFields).length > 0) {
      const filtered = filterAllowedFields(session.role, otherFields)
      if (Object.keys(filtered).length > 0) {
        await updateTask(params.id, filtered)
      }
    }

    if (status === 'Completed') {
      await handleTaskCompletion(params.id)
    } else if (status === 'In Progress') {
      await updateTask(params.id, { status: 'In Progress', startedAt: new Date().toISOString() })
    } else if (status) {
      await updateTask(params.id, { status })
    }

    if (managerReviewStatus === 'Approved') {
      await updateTask(params.id, { managerReviewStatus: 'Approved' })
      await handleManagerApproval(params.id)
    } else if (managerReviewStatus === 'Rejected') {
      await updateTask(params.id, { managerReviewStatus: 'Rejected' })
      await handleManagerRejection(params.id)
    } else if (managerReviewStatus) {
      await updateTask(params.id, { managerReviewStatus })
    }

    const updated = await getTaskById(params.id)
    return NextResponse.json({ task: updated })
  },
)
