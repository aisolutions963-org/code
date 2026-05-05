import { Resend } from 'resend'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

export async function notifyAccountant(payment: {
  projectName: string
  projectId: string
  amount: number
  paymentType: string
  method: string
  reference: string
  receivedDate: string
  recordedBy: string
}): Promise<void> {
  await getResend().emails.send({
    from: 'WoodWings <notifications@woodwings.ae>',
    to: process.env.ACCOUNTANT_EMAIL!,
    subject: `Payment recorded — ${payment.projectId} — AED ${payment.amount.toLocaleString()}`,
    html: `
      <h2>Payment recorded on WoodWings</h2>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
        <tr><td><strong>Project</strong></td><td>${payment.projectName} (${payment.projectId})</td></tr>
        <tr><td><strong>Amount</strong></td><td>AED ${payment.amount.toLocaleString()}</td></tr>
        <tr><td><strong>Type</strong></td><td>${payment.paymentType}</td></tr>
        <tr><td><strong>Method</strong></td><td>${payment.method}</td></tr>
        <tr><td><strong>Reference</strong></td><td>${payment.reference}</td></tr>
        <tr><td><strong>Date received</strong></td><td>${payment.receivedDate}</td></tr>
        <tr><td><strong>Recorded by</strong></td><td>${payment.recordedBy}</td></tr>
      </table>
    `,
  })
}
