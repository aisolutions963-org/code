import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getTaskCountForProject, generateTasksForProject } from '@/lib/airtable'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session || session.role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { stage?: string; force?: boolean } = {}
  try {
    body = await request.json()
  } catch {
    // empty body is fine
  }

  const { stage, force = false } = body
  if (!stage) {
    return NextResponse.json({ error: 'stage is required' }, { status: 400 })
  }

  try {
    if (!force) {
      const existingCount = await getTaskCountForProject(params.id)
      if (existingCount > 0) {
        return NextResponse.json(
          {
            error: 'Tasks already exist for this project',
            existingCount,
            hint: 'Pass force: true to generate anyway',
          },
          { status: 409 },
        )
      }
    }

    const result = await generateTasksForProject(params.id, stage)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('POST /api/projects/[id]/generate-tasks error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 },
    )
  }
}
