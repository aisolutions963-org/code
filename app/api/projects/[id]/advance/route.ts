import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import {
  getProjectById,
  updateProject,
  getIncompleteTasksForProject,
  generateTasksForProject,
} from '@/lib/airtable'
import { notifyTasksReady } from '@/lib/notifications'
import { PROJECTS } from '@/lib/fieldMap'
import { STAGE_ORDER } from '@/lib/phases'

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
    const currentIndex = (STAGE_ORDER as readonly string[]).indexOf(project.projectStage)

    if (currentIndex === -1) {
      return NextResponse.json({ error: 'Unknown project stage' }, { status: 400 })
    }

    if (currentIndex >= STAGE_ORDER.length - 1) {
      return NextResponse.json({ error: 'Project is already at the final stage' }, { status: 400 })
    }

    const incompleteTasks = await getIncompleteTasksForProject(params.id)

    let blocking: typeof incompleteTasks
    if (project.projectStage === 'Preparing') {
      // Phase 1 only requires all [GATE] tasks and the "Call the Client" task to be complete.
      // All path tasks, action tasks, and LOOP tasks are optional.
      blocking = incompleteTasks.filter(
        (t) =>
          t.taskName.toLowerCase().startsWith('[gate]') ||
          t.taskName.toLowerCase().startsWith('call the client'),
      )
    } else {
      // All other phases require every ordered task (except headline) to be complete.
      blocking = incompleteTasks.filter(
        (t) =>
          (t.templateOrder ?? []).length > 0 &&
          !t.taskName.toLowerCase().startsWith('to follow tasks progress'),
      )
    }

    if (blocking.length > 0) {
      return NextResponse.json(
        {
          error: 'Cannot advance: incomplete tasks remain',
          blockingTasks: blocking.map((t) => ({
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

    // A19 — generate tasks for the new stage and notify relevant departments
    ;(async () => {
      try {
        const { todoTemplates } = await generateTasksForProject(params.id, nextStage)
        if (todoTemplates.length > 0) {
          notifyTasksReady(
            todoTemplates.map((t) => ({ taskName: t.taskName, departments: t.department })),
            `${nextStage} phase started for project ${updated.projectId ?? params.id}`,
          )
        }
      } catch (err) {
        console.error('[A19] Task generation failed after advance to', nextStage, ':', err)
      }
    })()

    return NextResponse.json({ project: updated, newStage: nextStage })
  } catch (error) {
    console.error('POST /api/projects/[id]/advance error:', error)
    return NextResponse.json({ error: 'Failed to advance project' }, { status: 500 })
  }
}
