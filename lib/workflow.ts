import { TASKS, PROJECTS } from './fieldMap'
import {
  getTaskById,
  updateTaskRaw,
  updateProject,
  getProjectById,
  getAllTasksForProjectAll,
  generateTasksForProject,
} from './airtable'
import { Task, TaskStatus } from './types'
import { notifyManager, notifyManagerEscalation } from './email'
import { createNotification, notifyTasksReady, DEPT_ROLE_MAP, ROLE_DASHBOARD } from './notifications'

const WORKFLOW_TIMEOUT_MS = 15_000
const HEADLINE_PREFIX = 'to follow tasks progress'
const AUTO_TASK_MARKER = '(auto)'
const CALL_CLIENT_PREFIX = 'call the client'
const GATE_PREFIX = '[gate]'

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('Workflow operation timed out')),
        WORKFLOW_TIMEOUT_MS,
      ),
    ),
  ])
}

async function maybeUnlockCallClient(projectId: string): Promise<void> {
  const allTasks = await getAllTasksForProjectAll(projectId)

  const gateTasks = allTasks.filter((t) =>
    t.taskName.toLowerCase().startsWith(GATE_PREFIX),
  )
  if (gateTasks.length === 0) return
  if (!gateTasks.every((t) => t.status === 'Completed')) return

  const callClientTask = allTasks.find(
    (t) =>
      t.taskName.toLowerCase().startsWith(CALL_CLIENT_PREFIX) &&
      t.status === 'Locked',
  )
  if (!callClientTask) return

  await updateTaskRaw(callClientTask.id, { [TASKS.STATUS]: 'To Do' as TaskStatus })

  createNotification({
    recipientRole: 'sed',
    title: `New task ready: ${callClientTask.taskName}`,
    body: 'All three approvals confirmed — time to call the client.',
    link: ROLE_DASHBOARD['sed'],
  })
}

async function unlockNextTasks(task: Task): Promise<void> {
  const projectId = task.project?.[0]
  if (!projectId) return

  // GATE/LOOP tasks (no templateOrder) only trigger the call-client gate check,
  // not the standard order chain.
  if ((task.templateOrder ?? []).length === 0) {
    await maybeUnlockCallClient(projectId)
    return
  }

  // Fetch all tasks once — used for AND-join check and locked task discovery.
  const allProjectTasks = await getAllTasksForProjectAll(projectId)

  const completedOrder = task.templateOrder![0]
  const taskPath = task.pathCondition ?? null

  // AND-join guard: if any sibling tasks at the same order level are still active
  // (To Do, In Progress, Pending Approval), the chain must not advance yet.
  const siblingsActive = allProjectTasks.filter(
    (t) =>
      t.id !== task.id &&
      (t.pathCondition ?? null) === taskPath &&
      t.templateOrder?.[0] === completedOrder &&
      (t.status === 'To Do' || t.status === 'In Progress' || t.status === 'Pending Approval'),
  )
  if (siblingsActive.length > 0) return

  // Build locked task list from fetched data (avoids a second Airtable call).
  const lockedTasks = allProjectTasks.filter(
    (t) =>
      t.status === 'Locked' &&
      (task.projectItem?.[0]
        ? t.projectItem?.[0] === task.projectItem[0]
        : !t.projectItem?.length),
  )
  if (lockedTasks.length === 0) return

  // Only unlock tasks in the same path (universal tasks form their own "null" path).
  // "Call the Client" is excluded from the order chain — it is unlocked exclusively
  // by the GATE tasks completing (see maybeUnlockCallClient above).
  const samePath = lockedTasks.filter(
    (t) =>
      (t.pathCondition ?? null) === taskPath &&
      !t.taskName.toLowerCase().startsWith(CALL_CLIENT_PREFIX),
  )
  if (samePath.length === 0) return

  const orders = samePath
    .map((t) => t.templateOrder?.[0])
    .filter((o): o is number => typeof o === 'number')
  if (orders.length === 0) return

  const minOrder = Math.min(...orders)
  const toUnlock = samePath.filter((t) => (t.templateOrder?.[0] ?? Infinity) === minOrder)

  await Promise.all(
    toUnlock.map((t) => updateTaskRaw(t.id, { [TASKS.STATUS]: 'To Do' as TaskStatus })),
  )

  // Auto-complete tasks: headline banners ("to follow tasks progress...") and system
  // tasks marked "(auto)". All tasks at this level are completed together, and the
  // chain continuation is triggered only once to prevent double-advancing.
  const autoComplete = toUnlock.filter(
    (t) =>
      t.taskName.toLowerCase().startsWith(HEADLINE_PREFIX) ||
      t.taskName.toLowerCase().includes(AUTO_TASK_MARKER),
  )
  const projectRef = task.projectId ?? projectId
  const projectLabel = task.projectRef ? `${task.projectRef}` : projectRef

  if (autoComplete.length > 0) {
    const now = new Date().toISOString()
    await Promise.all(
      autoComplete.map((t) =>
        updateTaskRaw(t.id, {
          [TASKS.STATUS]: 'Completed' as TaskStatus,
          [TASKS.COMPLETED_AT]: now,
        }),
      ),
    )
    // Notify each auto task's departments — they fire automatically but the
    // team still needs to know the event happened (e.g. "project is now Open").
    // Headline banners are purely visual and generate no notification.
    for (const t of autoComplete) {
      if (t.taskName.toLowerCase().startsWith(HEADLINE_PREFIX)) continue
      const depts = t.department ?? []
      const roles = depts
        .map((d) => DEPT_ROLE_MAP[d])
        .filter((r): r is string => Boolean(r))
      const uniqueRoles = Array.from(new Set(roles.length > 0 ? roles : ['manager']))
      const title = t.taskName.replace(/\s*\(auto\)\s*/gi, '').trim()
      for (const role of uniqueRoles) {
        createNotification({
          recipientRole: role,
          title,
          body: `Project ${projectLabel}`,
          link: ROLE_DASHBOARD[role] ?? '/dashboard/mgr',
        })
      }
    }
    // Trigger chain continuation once — all auto tasks are Completed so the
    // AND-join in the recursive call will pass cleanly.
    await unlockNextTasks(autoComplete[0])
  }

  // Send notifications only for real (non-auto) tasks that just unlocked.
  const realUnlocked = toUnlock.filter(
    (t) =>
      !t.taskName.toLowerCase().startsWith(HEADLINE_PREFIX) &&
      !t.taskName.toLowerCase().includes(AUTO_TASK_MARKER),
  )
  if (realUnlocked.length === 0) return

  // Build body from completed task's notes and file attachments
  const bodyParts: string[] = []
  const instructions = task.instructions?.filter(Boolean)
  if (instructions && instructions.length > 0) {
    bodyParts.push(instructions.join(' '))
  }
  if (task.managerComment) {
    bodyParts.push(`Note: ${task.managerComment}`)
  }
  const docs = task.taskDocuments?.filter((d) => d.url)
  if (docs && docs.length > 0) {
    bodyParts.push(`Files: ${docs.map((d) => d.filename).join(', ')}`)
  }
  const body = bodyParts.join('\n')

  for (const t of realUnlocked) {
    const depts = t.department ?? []
    const roles = depts
      .map((d) => DEPT_ROLE_MAP[d])
      .filter((r): r is string => Boolean(r))

    const uniqueRoles = Array.from(new Set(roles.length > 0 ? roles : ['manager']))

    for (const role of uniqueRoles) {
      const dashboard = ROLE_DASHBOARD[role] ?? '/dashboard/sed'
      createNotification({
        recipientRole: role,
        title: `New task ready: ${t.taskName}`,
        body: body
          ? `Completed: ${task.taskName} (${projectLabel})\n${body}`
          : `Completed: ${task.taskName} (${projectLabel})`,
        link: dashboard,
      })
    }
  }
}

export async function handleTaskCompletion(
  taskId: string,
  submittedBy?: string,
): Promise<{ finalStatus: TaskStatus }> {
  return withTimeout(
    (async () => {
      const task = await getTaskById(taskId)

      const needsReview =
        task.requiresManagerReview?.[0] === true ||
        task.requiresManagerReviewManually === true

      const alreadyApproved =
        task.managerReviewStatus === 'Approved' ||
        task.managerReviewStatus === 'Not Needed'

      if (needsReview && !alreadyApproved) {
        await updateTaskRaw(taskId, {
          [TASKS.STATUS]: 'Pending Approval' as TaskStatus,
          [TASKS.MANAGER_REVIEW_STATUS]: 'Pending',
        })
        if (process.env.MANAGER_EMAIL && process.env.RESEND_API_KEY) {
          notifyManager({
            taskName: task.taskName,
            projectId: task.projectId,
            submittedBy,
          }).catch((err) => console.error('[A12] Manager notify failed:', err))
        }
        return { finalStatus: 'Pending Approval' as TaskStatus }
      }

      await updateTaskRaw(taskId, {
        [TASKS.STATUS]: 'Completed' as TaskStatus,
        [TASKS.COMPLETED_AT]: new Date().toISOString(),
      })

      await unlockNextTasks(task)

      return { finalStatus: 'Completed' as TaskStatus }
    })(),
  )
}

export async function handleManagerApproval(taskId: string): Promise<void> {
  return withTimeout(
    (async () => {
      const task = await getTaskById(taskId)

      await updateTaskRaw(taskId, {
        [TASKS.STATUS]: 'Completed' as TaskStatus,
        [TASKS.COMPLETED_AT]: new Date().toISOString(),
      })

      await unlockNextTasks(task)
    })(),
  )
}

export async function handleManagerRejection(taskId: string): Promise<void> {
  const task = await withTimeout(getTaskById(taskId))
  await withTimeout(
    updateTaskRaw(taskId, {
      [TASKS.STATUS]: 'To Do' as TaskStatus,
    }),
  )
  // Notify the task's department that their work was rejected and needs rework
  const projectRef = task.projectId ?? task.project?.[0] ?? ''
  notifyTasksReady(
    [{ taskName: task.taskName, departments: task.department ?? [] }],
    `Rejected by manager — task returned for rework (${projectRef})` +
      (task.managerComment ? `\nNote: ${task.managerComment}` : ''),
  )
}

export async function handleCallClientOutcome(
  taskId: string,
  outcome: 'approved' | 'review' | 'refused',
): Promise<void> {
  return withTimeout(
    (async () => {
      const task = await getTaskById(taskId)
      const projectId = task.project?.[0]
      if (!projectId) throw new Error('Task has no linked project')

      const outcomeLabel =
        outcome === 'approved' ? 'Approved' : outcome === 'review' ? 'Review Required' : 'Refused'

      // Complete the Call the Client task
      await updateTaskRaw(taskId, {
        [TASKS.STATUS]: 'Completed' as TaskStatus,
        [TASKS.COMPLETED_AT]: new Date().toISOString(),
      })

      if (outcome === 'approved') {
        // Advance project to Phase 2
        await updateProject(projectId, { [PROJECTS.PROJECT_STAGE]: 'Open' })
        // Generate Phase 2 tasks and notify departments — fire-and-forget to avoid blocking
        ;(async () => {
          try {
            const { todoTemplates } = await generateTasksForProject(projectId, 'Open')
            const projectRef = task.projectId ?? projectId
            notifyTasksReady(
              todoTemplates.map((t) => ({ taskName: t.taskName, departments: t.department })),
              `Phase 2 started — client approved (${projectRef})`,
            )
          } catch (err) {
            console.error('[CALL-OUTCOME] Phase 2 task generation failed:', err)
          }
        })()

      } else if (outcome === 'review') {
        // Reset Phase 1 action tasks so the SED repeats the action flow
        const allTasks = await getAllTasksForProjectAll(projectId)
        const actionTasks = allTasks.filter((t) => t.id !== taskId)

        // Universal tasks with templateOrder >= 2 and < 18 (gateway through notification)
        const universalAction = actionTasks.filter(
          (t) =>
            !t.pathCondition &&
            typeof t.templateOrder?.[0] === 'number' &&
            t.templateOrder[0] >= 3 &&
            t.templateOrder[0] < 18,
        )
        const universalOrders = universalAction.map((t) => t.templateOrder![0])
        const minUniversal = universalOrders.length > 0 ? Math.min(...universalOrders) : Infinity

        // Path tasks — grouped by pathCondition
        const pathTasks = actionTasks.filter((t) => !!t.pathCondition)
        const pathGroups = new Map<string, Task[]>()
        for (const t of pathTasks) {
          const g = pathGroups.get(t.pathCondition!) ?? []
          g.push(t)
          pathGroups.set(t.pathCondition!, g)
        }

        // GATE / LOOP tasks — no templateOrder, reset to To Do
        const gateTasks = actionTasks.filter(
          (t) => !t.pathCondition && (t.templateOrder ?? []).length === 0,
        )

        const resets: Promise<unknown>[] = []

        for (const t of universalAction) {
          const s: TaskStatus = t.templateOrder![0] === minUniversal ? 'To Do' : 'Locked'
          resets.push(updateTaskRaw(t.id, { [TASKS.STATUS]: s }))
        }

        Array.from(pathGroups.entries()).forEach(([, group]) => {
          const minOrder = Math.min(...group.map((t: Task) => t.templateOrder?.[0] ?? Infinity))
          group.forEach((t: Task) => {
            const s: TaskStatus = (t.templateOrder?.[0] ?? Infinity) === minOrder ? 'To Do' : 'Locked'
            resets.push(updateTaskRaw(t.id, { [TASKS.STATUS]: s }))
          })
        })

        for (const t of gateTasks) {
          resets.push(updateTaskRaw(t.id, { [TASKS.STATUS]: 'To Do' as TaskStatus }))
        }

        await Promise.all(resets)

        // Notify SED and manager that the client requested a review
        const projectRef = task.projectId ?? projectId
        const reviewBody = `Client requested review on project ${projectRef}. Phase 1 action tasks have been reset.`
        createNotification({
          recipientRole: 'sed',
          title: 'Client requested review — action tasks reset',
          body: reviewBody,
          link: ROLE_DASHBOARD['sed'],
        })
        createNotification({
          recipientRole: 'manager',
          title: 'Client requested review',
          body: reviewBody,
          link: ROLE_DASHBOARD['manager'],
        })

      } else {
        // Refused — mark project stage as not approved
        await updateProject(projectId, { [PROJECTS.PROJECT_STAGE]: 'Not-Approved' })
      }
    })(),
  )
}

export async function handleCallCountEscalation(task: Task): Promise<void> {
  const projectId = task.project?.[0]
  if (!projectId) return

  const project = await withTimeout(getProjectById(projectId))
  if (project.projectStage === 'Not-Approved') return

  await withTimeout(
    updateProject(projectId, {
      [PROJECTS.PROJECT_STAGE]: 'Not-Approved',
    }),
  )

  if (process.env.MANAGER_EMAIL && process.env.RESEND_API_KEY) {
    notifyManagerEscalation({
      projectName: project.projectName,
      projectId: project.projectId,
      clientName: project.clientName,
    }).catch((err) => console.error('[A8] Escalation notify failed:', err))
  }
}
