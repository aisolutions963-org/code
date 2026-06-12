import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import {
  createHandoverSheet,
  getHandoverSheetForProject,
  getInstallationLogsByProject,
  getProjectById,
  updateProject,
} from '@/lib/airtable'
import { CreateHandoverSchema } from '@/lib/validation'
import { PROJECTS } from '@/lib/fieldMap'
import { createNotification, ROLE_DASHBOARD } from '@/lib/notifications'

export const POST = requireRole('installation', 'manager', 'superadmin')(
  async (req: NextRequest, session, { params }) => {
    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = CreateHandoverSchema.safeParse({
      finalInstallationDate: formData.get('finalInstallationDate'),
      customerSatisfaction: formData.get('customerSatisfaction'),
      installationDifficulty: formData.get('installationDifficulty'),
      newsletterOptIn: formData.get('newsletterOptIn') === 'true',
      notes: formData.get('notes') || undefined,
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 },
      )
    }

    const [project, existingSheets, logs] = await Promise.all([
      getProjectById(params.id),
      getHandoverSheetForProject(params.id),
      getInstallationLogsByProject(params.id),
    ])

    // Upsert: update the draft sheet built up from installation logs, or create one fresh
    const sheet = existingSheets.length > 0
      ? existingSheets[0]
      : await createHandoverSheet(params.id, parsed.data)

    // Handover submitted → project is now Closed.
    await updateProject(params.id, { [PROJECTS.PROJECT_STAGE]: 'Closed' })

    const projectRef = project.projectId ?? params.id
    const projectLabel = project.projectName
      ? `${projectRef} — ${project.projectName}`
      : projectRef

    for (const role of ['manager', 'sed', 'superadmin'] as const) {
      await createNotification({
        recipientRole: role,
        title: `Handover submitted — final payment pending`,
        body: `Handover recorded for ${projectLabel}. Final installation: ${parsed.data.finalInstallationDate}. Please request final payment from client to close project. Submitted by ${session.name}.`,
        link: ROLE_DASHBOARD[role],
      })
    }

    return NextResponse.json({ sheet, logs })
  },
)
