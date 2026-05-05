import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getProjectById, updateProject, getIncompleteTasksForProject } from '@/lib/airtable'
import { PROJECTS } from '@/lib/fieldMap'

const STAGE_ORDER = ['Preparing', 'Open', 'Closed']

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session || session.role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const project = await getProjectById(params.id)
    const currentIndex = STAGE_ORDER.indexOf(project.projectStage)

    if (currentIndex === -1) {
      return NextResponse.json({ error: 'Unknown project stage' }, { status: 400 })
    }

    if (currentIndex >= STAGE_ORDER.length - 1) {
      return NextResponse.json({ error: 'Project is already at the final stage' }, { status: 400 })
    }

    const incompleteTasks = await getIncompleteTasksForProject(params.id)
    if (incompleteTasks.length > 0) {
      return NextResponse.json(
        {
          error: 'Cannot advance: incomplete tasks remain',
          blockingTasks: incompleteTasks.map((t) => ({
            id: t.id,
            taskName: t.taskName,
            status: t.status,
            department: t.department,
          })),
        },
        { status: 400 },
      )
    }

    const nextStage = STAGE_ORDER[currentIndex + 1]
    const updated = await updateProject(params.id, {
      [PROJECTS.PROJECT_STAGE]: nextStage,
    })

    return NextResponse.json({ project: updated, newStage: nextStage })
  } catch (error) {
    console.error('POST /api/projects/[id]/advance error:', error)
    return NextResponse.json({ error: 'Failed to advance project' }, { status: 500 })
  }
}
