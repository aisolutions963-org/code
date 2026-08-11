import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { generateItemTasksForProject } from '@/lib/airtable'
import { isSedAuthorizedForProject } from '@/lib/sedAccess'
import { z } from 'zod'

const AddActionsSchema = z.object({
  actions: z
    .array(
      z.enum([
        'Site Visit (item)',
        'Select Sample (item)',
        'Design (item)',
        'Measurement (item)',
      ]),
    )
    .min(1, 'Select at least one action'),
})

export const POST = requireRole('sed', 'manager', 'superadmin')(async (req, session, { params }) => {
  const { id, itemId } = params

  if (session.role === 'sed' && !(await isSedAuthorizedForProject(session, id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = AddActionsSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation failed' },
      { status: 400 },
    )
  }

  const { created } = await generateItemTasksForProject(id, itemId, parsed.data.actions)
  return NextResponse.json({ created })
})
