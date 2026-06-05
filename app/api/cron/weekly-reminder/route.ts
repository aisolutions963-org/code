import { NextRequest, NextResponse } from 'next/server'
import { getProjects } from '@/lib/airtable'
import { createNotification, ROLE_DASHBOARD } from '@/lib/notifications'

// Called by Vercel Cron every Friday and Saturday morning.
// Sends in-app reminders to manager and superadmin to review Preparing-stage projects.
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const projects = await getProjects({ stage: 'Preparing' })

    if (projects.length === 0) {
      return NextResponse.json({ ok: true, notified: 0, message: 'No Preparing projects' })
    }

    const day = new Date().toLocaleDateString('en-AE', { weekday: 'long' })
    const isSaturday = new Date().getDay() === 6
    const urgency = isSaturday ? '⚠️ Follow-up reminder' : '📋 Weekly check-in'

    const projectList = projects
      .slice(0, 10)
      .map((p) => `• ${p.projectId || p.nickname || p.projectName} — ${p.clientName}`)
      .join('\n')

    const body =
      `${projects.length} project${projects.length !== 1 ? 's' : ''} in Preparing stage need attention.\n\n` +
      projectList +
      (projects.length > 10 ? `\n…and ${projects.length - 10} more` : '')

    for (const role of ['manager', 'superadmin'] as const) {
      await createNotification({
        recipientRole: role,
        title: `${urgency} — ${projects.length} Preparing project${projects.length !== 1 ? 's' : ''} (${day})`,
        body,
        link: `${ROLE_DASHBOARD[role]}?view=projects&stage=Preparing`,
      })
    }

    return NextResponse.json({ ok: true, notified: projects.length })
  } catch (error) {
    console.error('[Cron] weekly-reminder failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
