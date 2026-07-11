import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getTaskById, updateTask, checkAndUnlockCallClientTask, updateProject, getProjectById, upsertF2DeliveryEvent, deleteQuotationsByProject, deleteProjectItemsByProject, deletePerItemTasksByProject } from '@/lib/airtable'
import { PROJECTS } from '@/lib/fieldMap'
import { canEditField, filterAllowedFields, ROLE_TO_DEPARTMENT } from '@/lib/permissions'
import {
  handleTaskCompletion,
  handleCallCountEscalation,
} from '@/lib/workflow'
import { TaskUpdateInput } from '@/lib/types'
import { UpdateTaskSchema } from '@/lib/validation'
import { createNotification, ROLE_DASHBOARD } from '@/lib/notifications'
import { isSedAuthorizedForProject } from '@/lib/sedAccess'

export const GET = requireRole()(
  async (_req: NextRequest, session, { params }) => {
    const task = await getTaskById(params.id)
    if (session.role === 'sed') {
      const projectId = task.project?.[0]
      if (!projectId || !(await isSedAuthorizedForProject(session, projectId))) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 })
      }
    }
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

    if (session.role !== 'superadmin' && session.role !== 'manager') {
      // Installation may submit installation-specific fields on shared tasks (e.g. FixingTeamNote
      // task is department=Manager but installation fills in the schedule). Skip the department
      // check when at least one submitted field is exclusively owned by installation.
      const INSTALLATION_OWNED = new Set([
        'installationSchedule', 'teamDaysRequired', 'noOfLaborsPerDay',
        'installationDays', 'qcCheckAtSiteDone', 'fillersDone', 'fillersDocLinks',
      ])
      const hasInstallationOwnedField =
        session.role === 'installation' &&
        Object.keys(fields).some((k) => INSTALLATION_OWNED.has(k))

      if (!hasInstallationOwnedField) {
        const accessTask = await getTaskById(params.id)
        const allowedDepts = ROLE_TO_DEPARTMENT[session.role] ?? []
        const taskDepts: string[] = accessTask.department ?? []
        if (taskDepts.length > 0 && !taskDepts.some((d) => allowedDepts.includes(d))) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 })
        }
        if (session.role === 'sed') {
          const projectId = accessTask.project?.[0]
          if (!projectId || !(await isSedAuthorizedForProject(session, projectId))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
          }
        }
      }
    }

    const { status, callCount, followUpOutcome, superadminNote, ...otherFields } = fields as Partial<TaskUpdateInput>

    // F5 quotation reset — reverting a completed F5 task back to an editable status
    // wipes the prior quotation line items, project items, and per-item tasks so the
    // quotation can be resubmitted from scratch (no duplicated data).
    if (status !== undefined && status !== 'Completed') {
      const revertTask = await getTaskById(params.id)
      const isF5 = revertTask.taskName.toLowerCase().startsWith('f5 —')
      if (isF5 && revertTask.status === 'Completed') {
        const projectId = revertTask.project?.[0]
        if (projectId) {
          await Promise.all([
            deleteQuotationsByProject(projectId),
            deleteProjectItemsByProject(projectId),
            deletePerItemTasksByProject(projectId),
          ])
        }
      }
    }

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
        const scheduleRaw = otherFields.installationSchedule ?? taskForValidation.installationSchedule
        let body: string
        if (scheduleRaw) {
          try {
            const schedule: Array<{ workers?: string; date?: string; note?: string }> = JSON.parse(scheduleRaw)
            const days = schedule.length
            if (schedule[0] && 'workers' in schedule[0]) {
              const summary = schedule.map((r, i) => `Day ${i + 1}: ${r.workers} workers`).join(', ')
              body = `${days} installation day${days !== 1 ? 's' : ''} planned: ${summary}${projectLabel ? ` — ${projectLabel}` : ''}`
            } else {
              const valid = schedule.filter((r) => r.date)
              const dateList = valid.map((r) => r.note ? `${r.date} (${r.note})` : r.date).join(', ')
              body = `${valid.length} installation day${valid.length !== 1 ? 's' : ''} scheduled: ${dateList}${projectLabel ? ` — ${projectLabel}` : ''}`
            }
          } catch {
            body = `Installation schedule recorded${projectLabel ? ` — ${projectLabel}` : ''}`
          }
        } else {
          const daysVal = otherFields.teamDaysRequired ?? taskForValidation.teamDaysRequired
          body = `${daysVal != null ? `${daysVal} days` : 'Installation note'} needed for handover${projectLabel ? ` — ${projectLabel}` : ''}`
        }
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
