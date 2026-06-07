import { NextRequest, NextResponse } from 'next/server'
import { getAllProjects, upsertReminderEvent } from '@/lib/airtable'
import { createNotification, ROLE_DASHBOARD } from '@/lib/notifications'

// Called by Vercel Cron on the 1st of every month.
// Sends a monthly audit reminder to manager and superadmin,
// and upserts a calendar event for the audit day.
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10)
    const monthKey = `monthly-audit:${dateStr.slice(0, 7)}` // e.g. "monthly-audit:2026-06"
    const monthLabel = now.toLocaleDateString('en-AE', { month: 'long', year: 'numeric' })

    // Fetch all projects for summary counts
    const allProjects = await getAllProjects()
    const stageCounts: Record<string, number> = {}
    for (const p of allProjects) {
      const stage = p.projectStage ?? 'Unknown'
      stageCounts[stage] = (stageCounts[stage] ?? 0) + 1
    }

    const stageLines = Object.entries(stageCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([stage, count]) => `• ${stage}: ${count}`)
      .join('\n')

    const notifBody =
      `Monthly audit due — ${monthLabel}\n\n` +
      `Total projects: ${allProjects.length}\n` +
      stageLines

    for (const role of ['manager', 'superadmin'] as const) {
      await createNotification({
        recipientRole: role,
        title: `📊 Monthly Audit — ${monthLabel}`,
        body: notifBody,
        link: ROLE_DASHBOARD[role],
      })
    }

    // Upsert calendar event — idempotent on re-run
    await upsertReminderEvent({
      customKey: monthKey,
      title: `Monthly Audit — ${monthLabel}`,
      date: dateStr,
      notes: notifBody,
      createdBy: 'System',
    })

    return NextResponse.json({ ok: true, totalProjects: allProjects.length, stageCounts })
  } catch (error) {
    console.error('[Cron] monthly-audit failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
