import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { fetchAll, PROJECTS } from '@/lib/airtable/_client'

export const POST = requireRole('superadmin')(async () => {
  const c = await db()

  // Fetch all current project IDs from Airtable (record IDs only)
  const projectRecords = await fetchAll(PROJECTS.TABLE_ID, { fields: [] })
  const activeProjectIds = new Set(projectRecords.map((r) => r.id))

  const results: Record<string, number> = {}

  // 1. Delete all read notifications
  const readRes = await c.execute(
    `DELETE FROM notifications WHERE read = 1`,
  )
  results.read_notifications = Number(readRes.rowsAffected ?? 0)

  // 2. Delete unread notifications older than 30 days
  const oldUnreadRes = await c.execute(
    `DELETE FROM notifications WHERE read = 0 AND created_at < datetime('now', '-30 days')`,
  )
  results.old_unread_notifications = Number(oldUnreadRes.rowsAffected ?? 0)

  // 3. Delete inactivity_alerts for projects no longer in Airtable
  const allAlerts = await c.execute(`SELECT DISTINCT project_id FROM inactivity_alerts`)
  const staleAlertIds = allAlerts.rows
    .map((r) => String(r[0]))
    .filter((id) => !activeProjectIds.has(id))

  let staleAlerts = 0
  for (const id of staleAlertIds) {
    const res = await c.execute({
      sql: `DELETE FROM inactivity_alerts WHERE project_id = ?`,
      args: [id],
    })
    staleAlerts += Number(res.rowsAffected ?? 0)
  }
  results.stale_inactivity_alerts = staleAlerts

  // 4. Delete sed_projects mappings for projects no longer in Airtable
  const allSedMappings = await c.execute(`SELECT DISTINCT project_airtable_id FROM sed_projects`)
  const staleSedIds = allSedMappings.rows
    .map((r) => String(r[0]))
    .filter((id) => !activeProjectIds.has(id))

  let staleSed = 0
  for (const id of staleSedIds) {
    const res = await c.execute({
      sql: `DELETE FROM sed_projects WHERE project_airtable_id = ?`,
      args: [id],
    })
    staleSed += Number(res.rowsAffected ?? 0)
  }
  results.stale_sed_mappings = staleSed

  const totalDeleted = Object.values(results).reduce((a, b) => a + b, 0)

  return NextResponse.json({ ok: true, deleted: results, total: totalDeleted })
})
