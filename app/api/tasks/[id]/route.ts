import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getTaskById, updateTask, checkAndUnlockCallClientTask, updateProject } from '@/lib/airtable'
import { PROJECTS } from '@/lib/fieldMap'
import { canEditField, filterAllowedFields } from '@/lib/permissions'
import {
  handleTaskCompletion,
  handleManagerApproval,
  handleManagerRejection,
  handleCallCountEscalation,
} from '@/lib/workflow'
import { TaskUpdateInput } from '@/lib/types'
import { UpdateTaskSchema } from '@/lib/validation'
import { createNotification, ROLE_DASHBOARD } from '@/lib/notifications'

export const GET = requireRole()(
  async (_req: NextRequest, _session, { params }) => {
    const task = await getTaskById(params.id)
    return NextResponse.json({ task })
  },
)

export const PATCH = requireRole()(
  async (req: NextRequest, session, { params }) => {
    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    let fields: Partial<TaskUpdateInput>
    if (
      rawBody !== null &&
      typeof rawBody === 'object' &&
      'fields' in (rawBody as object)
    ) {
      const parsed = UpdateTaskSchema.safeParse((rawBody as { fields: unknown }).fields)
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
          { status: 400 },
        )
      }
      fields = parsed.data
    } else {
      return NextResponse.json({ error: 'fields object required' }, { status: 400 })
    }

    for (const key of Object.keys(fields)) {
      if (!canEditField(session.role, key)) {
        return NextResponse.json(
          { error: `Role '${session.role}' cannot edit field '${key}'` },
          { status: 403 },
        )
      }
    }

    const { status, managerReviewStatus, callCount, followUpOutcome, ...otherFields } = fields as Partial<TaskUpdateInput>

    if (Object.keys(otherFields).length > 0) {
      const filtered = filterAllowedFields(session.role, otherFields)
      if (Object.keys(filtered).length > 0) {
        await updateTask(params.id, filtered)
      }
    }

    if (callCount !== undefined) {
      await updateTask(params.id, { callCount })
      if (callCount >= 3) {
        const task = await getTaskById(params.id)
        handleCallCountEscalation(task).catch((err) =>
          console.error('[A8] Escalation failed:', err),
        )
      }
    }

    if (status === 'Completed') {
      await handleTaskCompletion(params.id, session.name)
    } else if (status === 'In Progress') {
      await updateTask(params.id, { status: 'In Progress', startedAt: new Date().toISOString() })
    } else if (status) {
      await updateTask(params.id, { status })
    }

    if (managerReviewStatus === 'Approved') {
      await updateTask(params.id, { managerReviewStatus: 'Approved' })
      await handleManagerApproval(params.id)
    } else if (managerReviewStatus === 'Rejected') {
      await updateTask(params.id, { managerReviewStatus: 'Rejected' })
      await handleManagerRejection(params.id)
    } else if (managerReviewStatus) {
      await updateTask(params.id, { managerReviewStatus })
    }

    const refreshed = await getTaskById(params.id)

    // Notify manager when SED schedules a site visit date
    if ('taskStartDate' in otherFields && otherFields.taskStartDate && refreshed.pathCondition === 'Visit Site to Gather Details') {
      const projectRef = refreshed.projectRef ?? refreshed.project?.[0] ?? ''
      createNotification({
        recipientRole: 'manager',
        title: `Site visit scheduled — ${projectRef}`,
        body: `Visit date set to ${otherFields.taskStartDate as string}${refreshed.projectName ? ` — ${refreshed.projectName}` : ''}`,
        link: ROLE_DASHBOARD['manager'],
      })
    }

    // Handle Follow Up task outcome — superadmin decision after 3-day inactivity
    if (followUpOutcome) {
      await updateTask(params.id, { followUpOutcome })
      const projectId = refreshed.project?.[0]
      const projectRef = refreshed.projectRef ?? projectId ?? ''
      const projectName = refreshed.projectName ? ` — ${refreshed.projectName}` : ''

      if (followUpOutcome === 'Reject Project' && projectId) {
        await updateProject(projectId, { [PROJECTS.APPROVAL_STATUS]: 'Not-Approved' })
        createNotification({
          recipientRole: 'sed',
          title: `Project rejected — ${projectRef}`,
          body: `Superadmin has rejected project "${refreshed.projectName ?? projectRef}" due to inactivity.`,
          link: ROLE_DASHBOARD['sed'],
        })
        createNotification({
          recipientRole: 'manager',
          title: `Project rejected — ${projectRef}`,
          body: `Project "${refreshed.projectName ?? projectRef}" was rejected due to inactivity.`,
          link: ROLE_DASHBOARD['manager'],
        })
      } else if (followUpOutcome === 'SED to Follow Up') {
        createNotification({
          recipientRole: 'sed',
          title: `Action needed — ${projectRef}`,
          body: `Superadmin requests SED follow up on project "${refreshed.projectName ?? projectRef}"${projectName}. Please take the next action.`,
          link: ROLE_DASHBOARD['sed'],
        })
      } else if (followUpOutcome === 'Manager to Follow Up') {
        createNotification({
          recipientRole: 'manager',
          title: `Follow up with client — ${projectRef}`,
          body: `Superadmin requests manager to follow up with the client or SED on project "${refreshed.projectName ?? projectRef}".`,
          link: ROLE_DASHBOARD['manager'],
        })
      }
      return NextResponse.json({ task: await getTaskById(params.id) })
    }

    // If any approval gate field was touched, check if all 3 are now cleared across
    // the project's gate tasks — if so, unlock the "Call the Client" task asynchronously
    const touchedApprovalField =
      'conceptDesignApproval' in otherFields ||
      'sampleApproval' in otherFields ||
      'quotationOutcome' in otherFields
    if (touchedApprovalField) {
      const projectId = refreshed.project?.[0]
      if (projectId) {
        checkAndUnlockCallClientTask(projectId).catch((err) =>
          console.error('[ALL-APPROVALS] unlock check failed:', err),
        )
      }
    }

    return NextResponse.json({ task: refreshed })
  },
)
