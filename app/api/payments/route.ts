import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import {
  createPayment,
  getPaymentsByProject,
  getProjectById,
  getMaintenanceRecordForProject,
  activateMaintenanceRecord,
  createMaintenanceRecord,
  updateProject,
} from '@/lib/airtable'
import { notifyAccountant, notifyAccountantEvent } from '@/lib/email'
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

    // Fetch project once: used for stageAtPayment capture + accountant email
    const project = await getProjectById(body.project[0]).catch(() => null)

    // Fetch existing payments: used for duplicate guards
    const existing = await getPaymentsByProject(body.project[0])

    // Final payment guard — prevent double-closure
    if (body.paymentType === 'Final') {
      const alreadyHasFinal = existing.some(
        (p) => p.paymentType === 'Final' && p.paymentStatus !== 'Cancelled',
      )
      if (alreadyHasFinal) {
        return NextResponse.json(
          { error: 'A Final payment already exists for this project. Void it first if you need to re-record.' },
          { status: 409 },
        )
      }
    }

    // General duplicate guard — same type + amount + date already exists
    const isDuplicate = existing.some(
      (p) =>
        p.paymentType === body.paymentType &&
        p.amount === body.amount &&
        p.receivedDate === body.receivedDate &&
        p.paymentStatus !== 'Cancelled',
    )
    if (isDuplicate) {
      return NextResponse.json(
        {
          error: `A ${body.paymentType} payment of AED ${body.amount.toLocaleString()} on ${body.receivedDate ?? 'this date'} already exists for this project.`,
        },
        { status: 409 },
      )
    }

    // Auto-capture the current project stage at time of payment
    const stageAtPayment = project?.projectStage ?? body.stageAtPayment

    const payment = await createPayment({ ...body, recordedBy: session.name, stageAtPayment })

    if (process.env.RESEND_API_KEY && project) {
      notifyAccountant({
        projectName: project.projectName,
        projectId: project.projectId,
        amount: body.amount,
        paymentType: body.paymentType,
        method: body.paymentMethod,
        reference: body.referenceNo ?? 'N/A',
        receivedDate: body.receivedDate ?? 'N/A',
        recordedBy: session.name,
      }).catch((err: unknown) => console.error('Accountant email failed:', err))
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
  const [project, existing] = await Promise.all([
    getProjectById(projectId),
    getMaintenanceRecordForProject(projectId),
  ])

  let warrantyEnd: string

  if (existing) {
    // Maintenance record was created at Phase 4 generation — just activate it
    await activateMaintenanceRecord(existing.id)
    warrantyEnd = existing.endDate
  } else {
    // Fallback: no Phase 4 record yet — create one now dated from today
    const start = new Date()
    const end = new Date(start)
    end.setFullYear(end.getFullYear() + 1)
    warrantyEnd = end.toISOString().slice(0, 10)
    await createMaintenanceRecord(projectId, {
      startDate: start.toISOString().slice(0, 10),
      endDate: warrantyEnd,
      status: 'Active',
    })
  }

  await updateProject(projectId, { [PROJECTS.PROJECT_STAGE]: 'Closed and active warranty' })

  const projectRef = project.projectId ?? projectId
  const projectLabel = project.projectName
    ? `${projectRef} — ${project.projectName}`
    : projectRef

  // Notify accountant by email
  notifyAccountantEvent({
    eventName: 'Final Payment Received — Project Closed',
    projectLabel,
  }).catch(() => {})

  // In-app notifications
  for (const role of ['sed', 'manager', 'superadmin'] as const) {
    createNotification({
      recipientRole: role,
      title: `Project closed — ${projectRef}`,
      body: `Final payment received for ${projectLabel}. Status: Closed and active warranty. Warranty active until ${warrantyEnd}. Recorded by ${recordedBy}.`,
      link: ROLE_DASHBOARD[role],
    })
  }
}
