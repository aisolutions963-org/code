import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { checkAndUnlockInactivityFollowUp, getProjectById } from '@/lib/airtable'
import { createNotification, ROLE_DASHBOARD } from '@/lib/notifications'

export const POST = requireRole('superadmin')(
  async (_req: NextRequest, _session, { params }) => {
    const project = await getProjectById(params.id)

    const lastModified = project.lastModifiedTasks
    if (!lastModified) return NextResponse.json({ unlocked: false })

    const daysSince = (Date.now() - new Date(lastModified).getTime()) / (1000 * 60 * 60 * 24)
    if (daysSince < 3) return NextResponse.json({ unlocked: false })

    const wasLocked = await checkAndUnlockInactivityFollowUp(params.id)
    if (!wasLocked) return NextResponse.json({ unlocked: false })

    const projectRef = project.projectId ?? params.id
    await createNotification({
      recipientRole: 'superadmin',
      title: `Inactivity alert — ${projectRef}`,
      body: `Project "${project.projectName}" has had no activity for ${Math.floor(daysSince)} days. A Follow Up task has been created for your decision.`,
      link: ROLE_DASHBOARD['superadmin'],
    })

    return NextResponse.json({ unlocked: true })
  },
)
