import {
  deleteTasksByProjectId,
  deletePaymentsByProject,
  deleteMaterialsByProject,
  deleteCalendarEventsByProject,
  deleteMaintenanceByProject,
  deletePurchaseOrdersByProject,
  deleteInstallationLogsByProject,
  deleteHandoverSheetsByProject,
  deleteTimesheetsByProject,
  deleteChildProjectsByProject,
  deleteProjectItemsByProject,
  deleteProjectById,
  getProjectClientId,
  deleteClientIfOrphaned,
} from '@/lib/airtable'
import { deleteSedProjectMappings, deleteInactivityAlerts } from '@/lib/db'

/**
 * Permanently delete a project and every record that references it.
 * Shared by the superadmin DELETE (permanent) route and the Trash auto-purge cron.
 */
export async function purgeProjectCascade(id: string): Promise<void> {
  // Capture the linked client before the project (and its link) is gone.
  const clientId = await getProjectClientId(id).catch(() => undefined)

  await Promise.all([
    deleteTasksByProjectId(id),
    deletePaymentsByProject(id),
    deleteMaterialsByProject(id),
    deleteCalendarEventsByProject(id),
    deleteMaintenanceByProject(id),
    deletePurchaseOrdersByProject(id),
    deleteInstallationLogsByProject(id),
    deleteHandoverSheetsByProject(id),
    deleteTimesheetsByProject(id),
    deleteChildProjectsByProject(id),
    deleteSedProjectMappings(id),
    deleteInactivityAlerts(id),
  ])
  // Items deleted after tasks to avoid orphaned item references
  await deleteProjectItemsByProject(id)
  await deleteProjectById(id)

  // Clean up the client too, but only once it has zero projects left — clients are shared
  // across a person's/company's full project history (getOrCreateClient reuses by name), so
  // this must never fire while the client still has other projects attached.
  if (clientId) {
    await deleteClientIfOrphaned(clientId).catch((err) =>
      console.error(`[purgeProjectCascade] client cleanup failed for ${clientId}:`, err),
    )
  }
}
