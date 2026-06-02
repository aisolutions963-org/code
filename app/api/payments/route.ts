import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import {
  createPayment,
  getPaymentsByProject,
  getProjectById,
  getHandoverSheetForProject,
  createMaintenanceRecord,
  updateProject,
} from '@/lib/airtable'
import { notifyAccountant } from '@/lib/email'
import { CreatePaymentSchema } from '@/lib/validation'
import { PROJECTS } from '@/lib/fieldMap'
import { createNotification, ROLE_DASHBOARD } from '@/lib/notifications'

export const GET = requireRole('manager', 'superadmin')(async (req: NextRequest) => {
  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: 'projectId query param required' }, { status: 400 })
  }
  const payments = await getPaymentsByProject(projectId)
  return NextResponse.json({ payments })
})

export const POST = requireRole('manager', 'superadmin')(
  async (req: NextRequest, session) => {
    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = CreatePaymentSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 },
      )
    }

    const body = parsed.data
    const payment = await createPayment(body)

    if (process.env.RESEND_API_KEY) {
      getProjectById(body.project[0])
        .then((proj) =>
          notifyAccountant({
            projectName: proj.projectName,
            projectId: proj.projectId,
            amount: body.amount,
            paymentType: body.paymentType,
            method: body.paymentMethod,
            reference: body.referenceNo ?? 'N/A',
            receivedDate: body.receivedDate ?? 'N/A',
            recordedBy: session.name,
          }),
        )
        .catch((err) => console.error('Accountant email failed:', err))
    }

    // Final payment → close project + start 1-year maintenance period
    let closureWarning: string | undefined
    if (body.paymentType === 'Final') {
      try {
        await closeProjectAfterFinalPayment(body.project[0], session.name)
      } catch (err) {
        console.error('Final payment closure failed:', err)
        closureWarning = 'Payment recorded but project closure failed — please check project status.'
      }
    }

    return NextResponse.json(
      { payment, ...(closureWarning ? { warning: closureWarning } : {}) },
      { status: 201 },
    )
  },
)

async function closeProjectAfterFinalPayment(projectId: string, recordedBy: string) {
  const [project, sheets] = await Promise.all([
    getProjectById(projectId),
    getHandoverSheetForProject(projectId),
  ])

  const handoverDate =
    sheets[0]?.finalInstallationDate ?? new Date().toISOString().slice(0, 10)

  const endDate = new Date(handoverDate)
  endDate.setFullYear(endDate.getFullYear() + 1)
  const endDateStr = endDate.toISOString().slice(0, 10)

  await Promise.all([
    updateProject(projectId, { [PROJECTS.PROJECT_STAGE]: 'Closed' }),
    createMaintenanceRecord(projectId, { startDate: handoverDate, endDate: endDateStr }),
  ])

  const projectRef = project.projectId ?? projectId
  const projectLabel = project.projectName
    ? `${projectRef} — ${project.projectName}`
    : projectRef

  for (const role of ['sed', 'superadmin'] as const) {
    createNotification({
      recipientRole: role,
      title: `Project closed — ${projectRef}`,
      body: `Final payment received for ${projectLabel}. Project is now Closed. 1-year maintenance active until ${endDateStr}. Recorded by ${recordedBy}.`,
      link: ROLE_DASHBOARD[role],
    })
  }
}
