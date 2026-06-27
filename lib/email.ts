import { Resend } from 'resend'
import { getSetting } from './db'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

export async function notifyManager(task: {
  taskName: string
  projectId?: string
  submittedBy?: string
}): Promise<void> {
  const to = process.env.MANAGER_EMAIL
  if (!to) return
  await getResend().emails.send({
    from: 'WoodWings <notifications@woodwings.ae>',
    to,
    subject: `Task pending review — ${task.projectId ?? 'WoodWings'}`,
    html: `
      <h2>Task awaiting your approval</h2>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
        <tr><td><strong>Task</strong></td><td>${task.taskName}</td></tr>
        ${task.projectId ? `<tr><td><strong>Project</strong></td><td>${task.projectId}</td></tr>` : ''}
        ${task.submittedBy ? `<tr><td><strong>Submitted by</strong></td><td>${task.submittedBy}</td></tr>` : ''}
      </table>
      <p>Log in to the WoodWings dashboard to approve or reject.</p>
    `,
  })
}

export async function notifyManagerEscalation(project: {
  projectName: string
  projectId: string
  clientName: string
}): Promise<void> {
  const to = process.env.MANAGER_EMAIL
  if (!to) return
  await getResend().emails.send({
    from: 'WoodWings <notifications@woodwings.ae>',
    to,
    subject: `3-call escalation — ${project.projectId} — Client not responding`,
    html: `
      <h2>Client not responding — 3 call attempts reached</h2>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
        <tr><td><strong>Project</strong></td><td>${project.projectName} (${project.projectId})</td></tr>
        <tr><td><strong>Client</strong></td><td>${project.clientName}</td></tr>
      </table>
      <p>The project has been automatically marked as <strong>Not-Approved</strong>.</p>
      <p>Log in to the WoodWings dashboard to review and decide next steps.</p>
    `,
  })
}

export async function notifyCallClient(project: {
  projectName: string
  projectId: string
  clientName: string
}): Promise<void> {
  const to = process.env.MANAGER_EMAIL
  if (!to) return
  await getResend().emails.send({
    from: 'WoodWings <notifications@woodwings.ae>',
    to,
    subject: `All gates cleared — call client now — ${project.projectId}`,
    html: `
      <h2>All approval gates cleared — client call required</h2>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
        <tr><td><strong>Project</strong></td><td>${project.projectName} (${project.projectId})</td></tr>
        <tr><td><strong>Client</strong></td><td>${project.clientName}</td></tr>
      </table>
      <p>Concept design, sample, and quotation have all been approved.<br>
      Call the client now to get final confirmation and advance the project.</p>
      <p>Log in to the WoodWings dashboard to complete the <strong>Call the Client — All Approvals</strong> task.</p>
    `,
  })
}

export async function notifyAccountantEvent(params: {
  eventName: string
  projectLabel: string
  link?: string
  linkLabel?: string
}): Promise<void> {
  const accountantEmail = await getSetting('accountant_email')
  if (!accountantEmail) return
  const baseUrl = process.env.APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
  const fullLink = params.link && baseUrl ? `${baseUrl}${params.link}` : null
  const linkHtml = fullLink
    ? `<p><a href="${fullLink}" style="display:inline-block;padding:8px 16px;background:#1a1a2e;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">${params.linkLabel ?? 'View in Dashboard'}</a></p>`
    : `<p>Log in to the WoodWings dashboard to review.</p>`
  await getResend().emails.send({
    from: 'WoodWings <notifications@woodwings.ae>',
    to: accountantEmail,
    subject: `${params.eventName} — ${params.projectLabel}`,
    html: `
      <h2>${params.eventName}</h2>
      <p><strong>Project:</strong> ${params.projectLabel}</p>
      ${linkHtml}
    `,
  })
}

export async function notifyRejection(params: {
  taskName: string
  projectId?: string
  managerComment?: string
  recipientEmail: string
}): Promise<void> {
  await getResend().emails.send({
    from: 'WoodWings <notifications@woodwings.ae>',
    to: params.recipientEmail,
    subject: `Task rejected — ${params.projectId ?? 'WoodWings'}`,
    html: `
      <h2>Task was not approved</h2>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
        <tr><td><strong>Task</strong></td><td>${params.taskName}</td></tr>
        ${params.projectId ? `<tr><td><strong>Project</strong></td><td>${params.projectId}</td></tr>` : ''}
        ${params.managerComment ? `<tr><td><strong>Comment</strong></td><td>${params.managerComment}</td></tr>` : ''}
      </table>
      <p>Log in to the WoodWings dashboard to review and resubmit.</p>
    `,
  })
}

export async function notifyAutoTaskEvent(params: {
  taskName: string
  projectLabel: string
}): Promise<void> {
  const to = process.env.MANAGER_EMAIL
  if (!to || !process.env.RESEND_API_KEY) return
  await getResend().emails.send({
    from: 'WoodWings <notifications@woodwings.ae>',
    to,
    subject: `${params.taskName} — ${params.projectLabel}`,
    html: `
      <h2>${params.taskName}</h2>
      <p><strong>Project:</strong> ${params.projectLabel}</p>
      <p>This event completed automatically. Log in to the dashboard to review.</p>
    `,
  })
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
  const accountantEmail = await getSetting('accountant_email')
  if (!accountantEmail) return
  await getResend().emails.send({
    from: 'WoodWings <notifications@woodwings.ae>',
    to: accountantEmail,
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
