import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import {
  createPayment,
  getPaymentsByProject,
  getPaymentsByProjectIds,
  getAllPayments,
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
  const projectIds = req.nextUrl.searchParams.get('projectIds')
  const all = req.nextUrl.searchParams.get('all') === 'true'

  if (all) {
    const payments = await getAllPayments()
    return NextResponse.json({ payments })
  }

  if (projectIds) {
    const ids = projectIds.split(',').filter(Boolean)
    const payments = await getPaymentsByProjectIds(ids)
    return NextResponse.json({ payments })
  }

  if (!projectId) {
    return NextResponse.json({ error: 'projectId, projectIds, or all=true query param required' }, { status: 400 })
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
        (body.receivedDate === undefined || p.receivedDate === body.receivedDate) &&
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

    // For Trade/Variance sub-projects, auto-set the payment name to the trade reference
    // so the calendar event title shows the reference instead of the generic payment type.
    const name =
      (project?.requestType === 'Trade' || project?.requestType === 'Variance') && project.tradeReference
        ? project.tradeReference
        : undefined

    const payment = await createPayment({ ...body, recordedBy: session.name, stageAtPayment, ...(name ? { name } : {}) })

    // If the user captured a quotation number/reference on a contract payment for a
    // project that had none, persist it to the project so later payments auto-fill it.
    // Best-effort — never fail the payment on this.
    if ((body.quotationNumber || body.quotationReference) && project && !project.quotationNumber) {
      const quoteFields: Record<string, unknown> = {}
      if (body.quotationNumber) quoteFields[PROJECTS.QUOTATION_NUMBER] = body.quotationNumber
      if (body.quotationReference) quoteFields[PROJECTS.QUOTATION_REFERENCE] = body.quotationReference
      await updateProject(body.project[0], quoteFields).catch((err: unknown) =>
        console.error('[Payment] quotation persist failed:', err),
      )
    }

    // No calendar event here — getCalendarEvents already surfaces a richer payment-received
    // event (with amount/type) from the Payments table; a custom copy would duplicate it.

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
  }).catch((err: unknown) => console.error('[Payment] notifyAccountantEvent failed:', err))

  // In-app notifications
  for (const role of ['sed', 'manager', 'superadmin'] as const) {
    createNotification({
      recipientRole: role,
      title: `Project closed — ${projectRef}`,
      body: `Final payment received for ${projectLabel}. Status: Closed and active warranty. Warranty active until ${warrantyEnd}. Recorded by ${recordedBy}.`,
      link: ROLE_DASHBOARD[role],
    }).catch((err: unknown) => console.error('[Payment] createNotification failed:', err))
  }
}
