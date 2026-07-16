// Closing-stage transitions — kept in the airtable layer so both the workflow engine
// (lib/workflow.ts) and Phase-4 task generation (lib/airtable/tasks.ts) can apply them
// without a circular import.

import { PROJECTS } from '../fieldMap'
import { getProjectById, updateProject } from './projects'
import {
  getMaintenanceRecordForProject,
  activateMaintenanceRecord,
  createMaintenanceRecord,
} from './maintenance'

// The closing tasks named "Change …" carry the canonical PROJECT_STAGE transitions. Driven
// off task completion (auto path in unlockNextTasks, manual path in handleTaskCompletion, and
// the self-heal path in generatePhase4Tasks) so the phase advances no matter how the task
// completes. Idempotent — never downgrades a later stage.
const CLOSED_OR_LATER = new Set(['Closed', 'Closed and active warranty', 'Warranty expired'])

export async function applyClosingStageTransition(taskName: string, projectId: string): Promise<void> {
  const name = taskName.toLowerCase()
  const toClosed = name.includes('change project status to closed project list')
  const toWarranty = name.includes('closed and valid maintenance')
  if (!toClosed && !toWarranty) return

  const project = await getProjectById(projectId).catch(() => null)
  if (!project) return
  const stage = project.projectStage

  if (toWarranty) {
    if (stage === 'Closed and active warranty' || stage === 'Warranty expired') return
    // Start / activate the 1-year maintenance record (mirrors closeProjectAfterFinalPayment).
    const existing = await getMaintenanceRecordForProject(projectId).catch(() => null)
    if (existing) {
      await activateMaintenanceRecord(existing.id)
    } else {
      const start = new Date()
      const end = new Date(start)
      end.setFullYear(end.getFullYear() + 1)
      await createMaintenanceRecord(projectId, {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        status: 'Active',
      })
    }
    await updateProject(projectId, { [PROJECTS.PROJECT_STAGE]: 'Closed and active warranty' })
  } else if (toClosed && !CLOSED_OR_LATER.has(stage)) {
    await updateProject(projectId, { [PROJECTS.PROJECT_STAGE]: 'Closed' })
  }
}
