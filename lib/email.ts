import { Resend } from 'resend'
import { getSetting } from './db'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

const BASE_URL =
  process.env.APP_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://woodwings.ae')

function emailWrapper(content: string, showLoginHint = true): string {
  const footerNote = showLoginHint
    ? `Please do not reply to this email. Log in at <a href="${BASE_URL}" style="color:#1a1a2e;text-decoration:none;">${BASE_URL}</a> to take action.`
    : 'Please do not reply to this email.'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>WoodWings Notification</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#1a1a2e;padding:28px 40px;text-align:center;">
            <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:2px;font-family:'Segoe UI',Arial,sans-serif;">WoodWings</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 28px;">
            ${content}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8f8fa;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              This is an automated notification from <strong style="color:#6b7280;">WoodWings Project Management</strong>.<br/>
              ${footerNote}
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function heading(text: string): string {
  return `<h2 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#1a1a2e;">${text}</h2>`
}

function infoTable(rows: [string, string | undefined][]): string {
  const filtered = rows.filter((r): r is [string, string] => Boolean(r[1]))
  if (filtered.length === 0) return ''
  return `
  <table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:0 0 24px;">
    ${filtered
      .map(
        ([label, value]) => `
    <tr>
      <td style="padding:10px 14px;background:#f8f8fa;border:1px solid #e5e7eb;width:36%;font-size:13px;font-weight:600;color:#374151;">${label}</td>
      <td style="padding:10px 14px;background:#ffffff;border:1px solid #e5e7eb;font-size:13px;color:#111827;">${value}</td>
    </tr>`,
      )
      .join('')}
  </table>`
}

function ctaButton(label: string, href: string): string {
  return `<p style="margin:24px 0 0;">
    <a href="${href}" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;border-radius:7px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.3px;">${label}</a>
  </p>`
}

function bodyText(text: string): string {
  return `<p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#374151;">${text}</p>`
}

function alertBadge(label: string, color: string): string {
  return `<p style="margin:0 0 20px;">
    <span style="display:inline-block;padding:4px 12px;background:${color}20;color:${color};border:1px solid ${color}50;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">${label}</span>
  </p>`
}

// ─── Notification functions ──────────────────────────────────────────────────

export async function notifyManager(task: {
  taskName: string
  projectId?: string
  submittedBy?: string
}): Promise<void> {
  const to = process.env.MANAGER_EMAIL
  if (!to) return

  const projectLabel = task.projectId ?? '—'
  const dashboardUrl = `${BASE_URL}/dashboard/mgr`

  await getResend().emails.send({
    from: 'WoodWings <notifications@woodwings.ae>',
    to,
    subject: `Action required — Task pending review | ${projectLabel}`,
    html: emailWrapper(`
      ${alertBadge('Pending Review', '#f59e0b')}
      ${heading('A task is awaiting your approval')}
      ${bodyText('A team member has submitted the following task for manager review. Please log in to approve or reject it.')}
      ${infoTable([
        ['Task', task.taskName],
        ['Project', task.projectId],
        ['Submitted by', task.submittedBy],
        ['Submitted at', new Date().toLocaleString('en-AE', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' })],
      ])}
      ${ctaButton('Review Task → Approve or Reject', dashboardUrl)}
    `),
  })
}

export async function notifyManagerEscalation(project: {
  projectName: string
  projectId: string
  clientName: string
}): Promise<void> {
  const to = process.env.MANAGER_EMAIL
  if (!to) return

  const dashboardUrl = `${BASE_URL}/dashboard/mgr`

  await getResend().emails.send({
    from: 'WoodWings <notifications@woodwings.ae>',
    to,
    subject: `Escalation — Client not responding after 3 attempts | ${project.projectId}`,
    html: emailWrapper(`
      ${alertBadge('Escalation', '#ef4444')}
      ${heading('Client unreachable — 3 call attempts reached')}
      ${bodyText('The sales team has made three unsuccessful attempts to contact this client. The project has been automatically marked as <strong>Not-Approved</strong>. Your review and decision on next steps is required.')}
      ${infoTable([
        ['Project Name', project.projectName],
        ['Project ID', project.projectId],
        ['Client', project.clientName],
        ['Status set to', 'Not-Approved (automatic)'],
        ['Escalated at', new Date().toLocaleString('en-AE', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' })],
      ])}
      ${ctaButton('View Project & Decide Next Steps', dashboardUrl)}
    `),
  })
}

export async function notifyCallClient(project: {
  projectName: string
  projectId: string
  clientName: string
}): Promise<void> {
  const to = process.env.MANAGER_EMAIL
  if (!to) return

  const dashboardUrl = `${BASE_URL}/dashboard/mgr`

  await getResend().emails.send({
    from: 'WoodWings <notifications@woodwings.ae>',
    to,
    subject: `All approvals cleared — call client now | ${project.projectId}`,
    html: emailWrapper(`
      ${alertBadge('Ready to Proceed', '#22c55e')}
      ${heading('All approval gates cleared — client call required')}
      ${bodyText('The concept design, material sample, and quotation have all been approved internally. The next step is to contact the client to obtain final confirmation and advance the project to the production phase.')}
      ${infoTable([
        ['Project Name', project.projectName],
        ['Project ID', project.projectId],
        ['Client', project.clientName],
        ['Cleared at', new Date().toLocaleString('en-AE', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' })],
        ['Next action', 'Call the Client — All Approvals task'],
      ])}
      ${ctaButton('Open Dashboard & Complete Task', dashboardUrl)}
    `),
  })
}

export async function notifyAccountantEvent(params: {
  eventName: string
  projectLabel: string
}): Promise<void> {
  const accountantEmail = process.env.ACCOUNTANT_EMAIL ?? await getSetting('accountant_email')
  if (!accountantEmail) return

  await getResend().emails.send({
    from: 'WoodWings <notifications@woodwings.ae>',
    to: accountantEmail,
    subject: `Finance action required — ${params.eventName} | ${params.projectLabel}`,
    html: emailWrapper(`
      ${alertBadge('Finance', '#8b5cf6')}
      ${heading(params.eventName)}
      ${infoTable([
        ['Project', params.projectLabel],
        ['Event', params.eventName],
        ['Triggered at', new Date().toLocaleString('en-AE', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' })],
      ])}
    `, false),
  })
}

export async function notifyRejection(params: {
  taskName: string
  projectId?: string
  managerComment?: string
  recipientEmail: string
}): Promise<void> {
  const dashboardUrl = `${BASE_URL}/dashboard`

  await getResend().emails.send({
    from: 'WoodWings <notifications@woodwings.ae>',
    to: params.recipientEmail,
    subject: `Task not approved — action required | ${params.projectId ?? 'WoodWings'}`,
    html: emailWrapper(`
      ${alertBadge('Not Approved', '#ef4444')}
      ${heading('Your submitted task was not approved')}
      ${bodyText('A manager has reviewed your submission and it was not approved. Please review the feedback below, make the necessary changes, and resubmit.')}
      ${infoTable([
        ['Task', params.taskName],
        ['Project', params.projectId],
        ['Manager feedback', params.managerComment ?? 'No comment provided'],
        ['Reviewed at', new Date().toLocaleString('en-AE', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' })],
      ])}
      ${ctaButton('Go to Dashboard & Resubmit', dashboardUrl)}
    `),
  })
}

export async function notifyAutoTaskEvent(params: {
  taskName: string
  projectLabel: string
}): Promise<void> {
  const to = process.env.MANAGER_EMAIL
  if (!to || !process.env.RESEND_API_KEY) return

  const dashboardUrl = `${BASE_URL}/dashboard/mgr`

  await getResend().emails.send({
    from: 'WoodWings <notifications@woodwings.ae>',
    to,
    subject: `Workflow update — ${params.taskName} | ${params.projectLabel}`,
    html: emailWrapper(`
      ${alertBadge('Automated Event', '#3b82f6')}
      ${heading('A workflow step completed automatically')}
      ${bodyText('The following task was completed automatically by the WoodWings workflow engine as part of the project lifecycle. No manual action is required unless you need to make corrections.')}
      ${infoTable([
        ['Task completed', params.taskName],
        ['Project', params.projectLabel],
        ['Completed at', new Date().toLocaleString('en-AE', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' })],
      ])}
      ${ctaButton('View Project in Dashboard', dashboardUrl)}
    `),
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
  const accountantEmail = process.env.ACCOUNTANT_EMAIL ?? await getSetting('accountant_email')
  if (!accountantEmail) return

  const formatted = `AED ${payment.amount.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  await getResend().emails.send({
    from: 'WoodWings <notifications@woodwings.ae>',
    to: accountantEmail,
    subject: `Payment recorded — ${formatted} | ${payment.projectId}`,
    html: emailWrapper(`
      ${alertBadge('Payment Received', '#22c55e')}
      ${heading('A new payment has been recorded')}
      ${bodyText('The following payment has been logged in the WoodWings system. Please verify the details and update your records accordingly.')}
      ${infoTable([
        ['Project Name', payment.projectName],
        ['Project ID', payment.projectId],
        ['Amount', formatted],
        ['Payment Type', payment.paymentType],
        ['Method', payment.method],
        ['Reference No.', payment.reference || '—'],
        ['Date Received', payment.receivedDate],
        ['Recorded by', payment.recordedBy],
        ['Recorded at', new Date().toLocaleString('en-AE', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' })],
      ])}
    `, false),
  })
}
