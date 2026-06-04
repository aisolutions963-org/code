import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getTaskCountForProject, generateTasksForProject, generatePhase3TasksForItem, getProjectItemsForProject, getProjectById } from '@/lib/airtable'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
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

  // Special: generate Phase 3 tasks for all items of this project
  if (stage === 'phase3') {
    try {
      const items = await getProjectItemsForProject(id)
      if (items.length === 0) {
        return NextResponse.json({ success: true, created: 0, message: 'No items found for this project' })
      }
      let totalCreated = 0
      for (const item of items) {
        const { created } = await generatePhase3TasksForItem(id, item.id)
        totalCreated += created
      }
      return NextResponse.json({ success: true, created: totalCreated, items: items.length })
    } catch (error) {
      console.error('POST /api/projects/[id]/generate-tasks phase3 error:', error)
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Phase 3 generation failed' },
        { status: 500 },
      )
    }
  }

  try {
    if (!force) {
      const existingCount = await getTaskCountForProject(id)
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

    const [result, project] = await Promise.all([
      generateTasksForProject(id, stage),
      getProjectById(id),
    ])

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('POST /api/projects/[id]/generate-tasks error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 },
    )
  }
}
