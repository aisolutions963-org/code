import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { generateItemTasksForProject } from '@/lib/airtable'
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params
  const session = await getSession()
  if (!session || !['sed', 'manager', 'superadmin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
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

  try {
    const { created } = await generateItemTasksForProject(id, itemId, parsed.data.actions)
    return NextResponse.json({ created })
  } catch (error) {
    console.error('POST /api/projects/[id]/items/[itemId] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add actions' },
      { status: 500 },
    )
  }
}
