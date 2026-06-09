import { NextRequest, NextResponse } from 'next/server'
import { getProjects, upsertReminderEvent } from '@/lib/airtable'
import { createNotification, ROLE_DASHBOARD } from '@/lib/notifications'
import { todayUAE } from '@/lib/dateUtils'

// Called by Vercel Cron every Friday and Saturday morning (UTC).
// Sends in-app reminders to manager and superadmin to review Preparing-stage projects.
// On Fridays also upserts a calendar event so it appears in the shared calendar.
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const projects = await getProjects({ stage: 'Preparing' })
    const now = new Date()
    const isFriday = now.getDay() === 5
    const isSaturday = now.getDay() === 6
    const day = now.toLocaleDateString('en-AE', { weekday: 'long' })
    const urgency = isSaturday ? '⚠️ Follow-up reminder' : '📋 Weekly check-in'

    const projectList = projects
      .slice(0, 10)
      .map((p) => `• ${p.projectId || p.nickname || p.projectName} — ${p.clientName}`)
      .join('\n')

    const notifBody = projects.length === 0
      ? 'No projects currently in Preparing stage.'
      : `${projects.length} project${projects.length !== 1 ? 's' : ''} in Preparing stage need attention.\n\n` +
        projectList +
        (projects.length > 10 ? `\n…and ${projects.length - 10} more` : '')

    const title = projects.length === 0
      ? `${urgency} — No Preparing projects (${day})`
      : `${urgency} — ${projects.length} Preparing project${projects.length !== 1 ? 's' : ''} (${day})`

    for (const role of ['manager', 'superadmin'] as const) {
      await createNotification({
        recipientRole: role,
        title,
        body: notifBody,
        link: `${ROLE_DASHBOARD[role]}?view=projects&stage=Preparing`,
      })
    }

    // On Friday: upsert a calendar event for this week's review
    if (isFriday) {
      const dateStr = todayUAE()
      // ISO week key so Saturday re-run doesn't duplicate the event
      const weekKey = `weekly-review:${dateStr}`
      await upsertReminderEvent({
        customKey: weekKey,
        title: `Weekly Review — ${projects.length} Preparing project${projects.length !== 1 ? 's' : ''}`,
        date: dateStr,
        notes: projects.length > 0 ? notifBody : 'No projects in Preparing stage this week.',
        createdBy: 'System',
      })
    }

    return NextResponse.json({ ok: true, notified: projects.length })
  } catch (error) {
    console.error('[Cron] weekly-reminder failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
