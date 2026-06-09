import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import {
  getProjectById,
  updateProject,
  getIncompleteTasksForProject,
  generateTasksForProject,
} from '@/lib/airtable'
import { notifyTasksReady } from '@/lib/notifications'
import { PROJECTS } from '@/lib/fieldMap'
import { STAGE_ORDER } from '@/lib/phases'

export const POST = requireRole('superadmin')(async (_req, _session, { params }) => {
  const { id } = params

  const project = await getProjectById(id)
  const currentIndex = (STAGE_ORDER as readonly string[]).indexOf(project.projectStage)

  if (currentIndex === -1) {
    return NextResponse.json({ error: 'Unknown project stage' }, { status: 400 })
  }
  if (currentIndex >= STAGE_ORDER.length - 1) {
    return NextResponse.json({ error: 'Project is already at the final stage' }, { status: 400 })
  }

  const incompleteTasks = await getIncompleteTasksForProject(id)

  let blocking: typeof incompleteTasks
  if (project.projectStage === 'Preparing') {
    blocking = incompleteTasks.filter(
      (t) =>
        t.taskName.toLowerCase().startsWith('[gate]') ||
        t.taskName.toLowerCase().startsWith('call the client'),
    )
  } else {
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
  const updated = await updateProject(id, { [PROJECTS.PROJECT_STAGE]: nextStage })

  // Fire-and-forget: generate tasks and notify departments for new stage
  ;(async () => {
    try {
      const { todoTemplates } = await generateTasksForProject(id, nextStage)
      if (todoTemplates.length > 0) {
        await notifyTasksReady(
          todoTemplates.map((t) => ({ taskName: t.taskName, departments: t.department })),
          `${nextStage} phase started for project ${updated.projectId ?? id}`,
        )
      }
    } catch (err) {
      console.error('[A19] Task generation failed after advance to', nextStage, ':', err)
    }
  })()

  return NextResponse.json({ project: updated, newStage: nextStage })
})
