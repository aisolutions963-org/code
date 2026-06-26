import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getTaskById, updateTask, checkAndUnlockCallClientTask, updateProject, getProjectById, upsertF2DeliveryEvent } from '@/lib/airtable'
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

    const { status, managerReviewStatus, callCount, followUpOutcome, superadminNote, ...otherFields } = fields as Partial<TaskUpdateInput>

    if (Object.keys(otherFields).length > 0) {
      const filtered = filterAllowedFields(session.role, otherFields)
      if (Object.keys(filtered).length > 0) {
        await updateTask(params.id, filtered)
      }
    }

    // Superadmin follow-up note — notify task departments, allow clearing with empty string
    if (superadminNote !== undefined && session.role === 'superadmin') {
      const noteTask = await getTaskById(params.id)
      await updateTask(params.id, { superadminNote: superadminNote || '' })
      if (superadminNote.trim()) {
        const depts = noteTask.department ?? []
        const roles = depts
          .map((d) => ({ SED: 'sed', Fabrication: 'fabrication', Installation: 'installation', Manager: 'manager', Management: 'manager', Purchase: 'manager' })[d])
          .filter((r): r is string => Boolean(r))
        const uniqueRoles = Array.from(new Set(roles.length > 0 ? roles : ['manager']))
        const projectRef = noteTask.projectRef ?? noteTask.project?.[0] ?? ''
        for (const role of uniqueRoles) {
          await createNotification({
            recipientRole: role,
            title: `📌 Follow-up note — ${noteTask.taskName}`,
            body: `Superadmin added a note on "${noteTask.taskName}"${projectRef ? ` (${projectRef})` : ''}:\n${superadminNote.trim()}`,
            link: `/${role === 'sed' ? 'dashboard/sed' : role === 'fabrication' ? 'dashboard/fab' : role === 'installation' ? 'dashboard/fix' : 'dashboard/mgr'}`,
          })
        }
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
      // Official quotation number AND reference are required before completing Make Quotation or F4.
      const taskForValidation = await getTaskById(params.id)
      const taskNameLC = taskForValidation.taskName.toLowerCase()
      const isMakeQuotationTask = taskNameLC.includes('make quotation') || taskForValidation.pathCondition === 'Make Quotation'
      const isF4Task = taskNameLC.startsWith('f4 —')
      if (isMakeQuotationTask || isF4Task) {
        const projectId = taskForValidation.project?.[0]
        if (projectId) {
          const project = await getProjectById(projectId)
          if (!project.quotationNumber?.trim()) {
            return NextResponse.json(
              { error: 'Quotation number is required before completing this task' },
              { status: 400 },
            )
          }
          if (!project.quotationReference?.trim()) {
            return NextResponse.json(
              { error: 'Quotation reference is required before completing this task' },
              { status: 400 },
            )
          }
        }
      }
      await handleTaskCompletion(params.id, session.name)
      const isFixingTeamNote =
        taskForValidation.taskName.toLowerCase().startsWith('fixing team note') ||
        taskForValidation.taskName.startsWith('ملاحظة فريق التركيب')
      if (isFixingTeamNote) {
        const projectRef = taskForValidation.projectRef ?? taskForValidation.project?.[0] ?? ''
        const projectLabel = taskForValidation.projectName
          ? `${projectRef} — ${taskForValidation.projectName}`
          : projectRef
        const daysVal = otherFields.teamDaysRequired ?? taskForValidation.teamDaysRequired
        const workersVal = otherFields.noOfLaborsPerDay ?? taskForValidation.noOfLaborsPerDay
        const body = `${daysVal != null ? `${daysVal} days` : ''}${daysVal != null && workersVal != null ? ', ' : ''}${workersVal != null ? `${workersVal} workers/day` : ''} needed for handover${projectLabel ? ` — ${projectLabel}` : ''}`
        for (const role of ['manager', 'sed', 'superadmin'] as const) {
          createNotification({
            recipientRole: role,
            title: `Fixing team handover note — ${projectRef}`,
            body,
            link: ROLE_DASHBOARD[role] ?? '/dashboard/mgr',
            category: 'installation',
          })
        }
      }
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

    // When manager sets a delivery date on an F2 task, upsert a calendar event
    let calendarWarning: string | undefined
    if ('completionDate' in otherFields && otherFields.completionDate && refreshed.taskName.toLowerCase().startsWith('f2 production list')) {
      const projectId = refreshed.project?.[0]
      const projectLabel = refreshed.projectNickname ?? refreshed.projectName ?? refreshed.projectRef ?? ''
      try {
        await upsertF2DeliveryEvent({
          taskId: params.id,
          title: `Delivery${projectLabel ? ` — ${projectLabel}` : ''}`,
          date: otherFields.completionDate as string,
          projectId,
          createdBy: session.name,
        })
      } catch (err) {
        console.error('[F2 calendar] upsert failed:', err)
        calendarWarning = 'Delivery date saved but calendar event failed to update.'
      }
    }

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
        await updateProject(projectId, { [PROJECTS.PROJECT_STAGE]: 'Not-Approved' })
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
      return NextResponse.json({ task: await getTaskById(params.id), ...(calendarWarning ? { warning: calendarWarning } : {}) })
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

    return NextResponse.json({ task: refreshed, ...(calendarWarning ? { warning: calendarWarning } : {}) })
  },
)
