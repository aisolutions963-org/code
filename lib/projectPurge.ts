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
} from '@/lib/airtable'
import { deleteSedProjectMappings, deleteInactivityAlerts } from '@/lib/db'

/**
 * Permanently delete a project and every record that references it.
 * Shared by the superadmin DELETE (permanent) route and the Trash auto-purge cron.
 */
export async function purgeProjectCascade(id: string): Promise<void> {
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
}
