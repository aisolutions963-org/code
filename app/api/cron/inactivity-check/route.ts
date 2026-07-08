import { NextRequest, NextResponse } from 'next/server'
import { getProjects, checkAndUnlockInactivityFollowUp, expireOverdueMaintenanceRecords, getDeletedProjects } from '@/lib/airtable'
import { createNotification, ROLE_DASHBOARD } from '@/lib/notifications'
import { purgeProjectCascade } from '@/lib/projectPurge'
import { db } from '@/lib/db'
import { todayUAE } from '@/lib/dateUtils'

export const dynamic = 'force-dynamic'

const INACTIVITY_DAYS = 3
const PURGE_AFTER_DAYS = 30

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = todayUAE()
  const c = await db()

  try {
    // Auto-expire warranties that have passed their 1-year end date
    let warrantiesExpired = 0
    try {
      warrantiesExpired = await expireOverdueMaintenanceRecords()
    } catch (err) {
      console.error('[cron/inactivity-check] warranty expiry failed:', err)
    }

    // Auto-purge projects that have sat in Trash (soft-deleted) for > 30 days
    let purged = 0
    try {
      const cutoff = Date.now() - PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000
      const deletedProjects = await getDeletedProjects()
      for (const p of deletedProjects) {
        if (!p.deletedAt || new Date(p.deletedAt).getTime() > cutoff) continue
        try {
          await purgeProjectCascade(p.id)
          purged++
          console.log(
            `[cron/inactivity-check] purged trashed project ${p.projectId ?? p.id} (deleted ${p.deletedAt})`,
          )
        } catch (err) {
          console.error(`[cron/inactivity-check] purge failed for ${p.id}:`, err)
        }
      }
    } catch (err) {
      console.error('[cron/inactivity-check] trash purge failed:', err)
    }

    const projects = await getProjects({ stage: 'Open' })
    let alerted = 0
    let skipped = 0

    for (const project of projects) {
      if (!project.lastModifiedTasks) {
        skipped++
        continue
      }

      const daysSince =
        (Date.now() - new Date(project.lastModifiedTasks).getTime()) / (1000 * 60 * 60 * 24)

      if (daysSince < INACTIVITY_DAYS) {
        skipped++
        continue
      }

      // Check if we already alerted today for this project
      const existing = await c.execute({
        sql: `SELECT id FROM inactivity_alerts WHERE project_id = ? AND alerted_at >= ?`,
        args: [project.id, today],
      })
      if (existing.rows.length > 0) {
        skipped++
        continue
      }

      const wasLocked = await checkAndUnlockInactivityFollowUp(project.id)

      await c.execute({
        sql: `INSERT OR IGNORE INTO inactivity_alerts (project_id, alerted_at) VALUES (?, datetime('now'))`,
        args: [project.id],
      })

      const projectRef = project.projectId ?? project.id
      await createNotification({
        recipientRole: 'superadmin',
        title: `Inactivity alert — ${projectRef}`,
        body: `Project "${project.projectName}" has had no task activity for ${Math.floor(daysSince)} days.${wasLocked ? ' A Follow Up task has been unlocked.' : ''}`,
        link: ROLE_DASHBOARD['superadmin'],
      })

      alerted++
    }

    return NextResponse.json({ ok: true, alerted, skipped, total: projects.length, warrantiesExpired, purged })
  } catch (error) {
    console.error('[cron/inactivity-check] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
