import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import {
  getProjectById,
  updateProject,
  generateTasksForProject,
  generatePhase3TasksForItem,
  generatePhase4Tasks,
  getProjectItemsForProject,
  getMaintenanceRecordForProject,
  createMaintenanceRecord,
  activateMaintenanceRecord,
} from '@/lib/airtable'
import { notifyTasksReady } from '@/lib/notifications'
import { PROJECTS } from '@/lib/fieldMap'
import { STAGE_ORDER } from '@/lib/phases'
import type { TaskTemplate } from '@/lib/airtable/tasks'

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

  const nextStage = STAGE_ORDER[currentIndex + 1]
  const updated = await updateProject(id, { [PROJECTS.PROJECT_STAGE]: nextStage })

  // Fire-and-forget: generate tasks for the new stage using the correct function per phase
  ;(async () => {
    try {
      let todoTemplates: TaskTemplate[] = []

      if (nextStage === 'Production') {
        // Phase 3: per-item tasks — generate for every project item
        const items = await getProjectItemsForProject(id)
        for (const item of items) {
          const { todoTemplates: tt } = await generatePhase3TasksForItem(id, item.id)
          todoTemplates.push(...tt)
        }
      } else if (nextStage === 'Closed and active warranty') {
        // Phase 4: closing tasks — now triggered when warranty phase begins
        const result = await generatePhase4Tasks(id)
        todoTemplates = result.todoTemplates

        // The advance button bypasses the handover + final-payment flow that normally
        // starts the warranty clock, so ensure a maintenance record exists (guarded).
        // Mirrors closeProjectAfterFinalPayment: activate an existing record, else create one.
        const existingMaintenance = await getMaintenanceRecordForProject(id).catch(() => null)
        if (existingMaintenance) {
          await activateMaintenanceRecord(existingMaintenance.id)
        } else {
          const start = new Date()
          const end = new Date(start)
          end.setFullYear(end.getFullYear() + 1)
          await createMaintenanceRecord(id, {
            startDate: start.toISOString().slice(0, 10),
            endDate: end.toISOString().slice(0, 10),
            status: 'Active',
          })
        }
      } else if (nextStage === 'Warranty expired') {
        // Terminal stage — no task generation
      } else {
        // Preparing / Open: standard project-level templates
        const result = await generateTasksForProject(id, nextStage)
        todoTemplates = result.todoTemplates
      }

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
