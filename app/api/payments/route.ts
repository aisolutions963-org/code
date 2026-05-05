import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { createPayment, getPaymentsByProject, getProjectById } from '@/lib/airtable'
import { notifyAccountant } from '@/lib/email'
import { CreatePaymentSchema } from '@/lib/validation'

export const GET = requireRole()(async (req: NextRequest) => {
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

    if (process.env.ACCOUNTANT_EMAIL && process.env.RESEND_API_KEY) {
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

    return NextResponse.json({ payment }, { status: 201 })
  },
)
