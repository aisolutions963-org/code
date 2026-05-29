import { TASKS, PROJECTS } from './fieldMap'
import {
  getTaskById,
  updateTaskRaw,
  updateProject,
  getProjectById,
  getAllTasksForProjectAll,
  getLockedBranchTasksForProject,
  generateTasksForProject,
  generatePhase3TasksForItem,
  generatePhase4Tasks,
  createMaterialOrder,
} from './airtable'
import { Task, TaskStatus } from './types'
import { notifyManager, notifyManagerEscalation } from './email'
import { createNotification, notifyTasksReady, DEPT_ROLE_MAP, ROLE_DASHBOARD } from './notifications'
import { PHASE_CONFIG, TASK_MARKERS } from './phases'

const WORKFLOW_TIMEOUT_MS = 15_000
const { HEADLINE_PREFIX, AUTO_MARKER: AUTO_TASK_MARKER, CALL_CLIENT_PREFIX, GATE_PREFIX, TAKE_APPROVAL_PREFIX } = TASK_MARKERS

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

async function maybeUnlockCallClient(projectId: string, projectItemId?: string): Promise<void> {
  const allTasks = await getAllTasksForProjectAll(projectId)

  if (projectItemId) {
    // Phase 2: per-item gate check — unlock "Take Approval" when both per-item gates clear
    const itemTasks = allTasks.filter((t) => t.projectItem?.[0] === projectItemId)
    const gateTasks = itemTasks.filter((t) => t.taskName.toLowerCase().startsWith(GATE_PREFIX))
    if (gateTasks.length === 0) return
    if (!gateTasks.every((t) => t.status === 'Completed')) return

    const takeApprovalTask = itemTasks.find(
      (t) =>
        t.taskName.toLowerCase().startsWith(TAKE_APPROVAL_PREFIX) &&
        t.status === 'Locked',
    )
    if (!takeApprovalTask) return

    await updateTaskRaw(takeApprovalTask.id, { [TASKS.STATUS]: 'To Do' as TaskStatus })
    createNotification({
      recipientRole: 'sed',
      title: `New task ready: ${takeApprovalTask.taskName}`,
      body: 'Both approvals confirmed — ready to take client approval to start fabrication.',
      link: ROLE_DASHBOARD['sed'],
    })
  } else {
    // Phase 1: project-level gate check — unlock "Call the Client" when all 3 gates clear
    const projectTasks = allTasks.filter((t) => !t.projectItem?.length)
    const gateTasks = projectTasks.filter((t) => t.taskName.toLowerCase().startsWith(GATE_PREFIX))
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
}

async function unlockNextTasks(task: Task): Promise<void> {
  const projectId = task.project?.[0]
  if (!projectId) return

  // GATE/LOOP tasks (no templateOrder) only trigger the call-client gate check,
  // not the standard order chain.
  if ((task.templateOrder ?? []).length === 0) {
    await maybeUnlockCallClient(projectId, task.projectItem?.[0])
    return
  }

  // Fetch all tasks once — used for AND-join check and locked task discovery.
  const allProjectTasks = await getAllTasksForProjectAll(projectId)

  const completedOrder = task.templateOrder![0]
  const taskPath = task.pathCondition ?? null

  // AND-join guard: if any sibling tasks at the same order level are still active
  // (To Do, In Progress, Pending Approval), the chain must not advance yet.
  // For per-item tasks, scope siblings to the same item so gate completion on one
  // item doesn't block advancement on another item.
  const siblingsActive = allProjectTasks.filter(
    (t) =>
      t.id !== task.id &&
      (t.pathCondition ?? null) === taskPath &&
      t.templateOrder?.[0] === completedOrder &&
      (task.projectItem?.[0]
        ? t.projectItem?.[0] === task.projectItem[0]
        : !t.projectItem?.length) &&
      (t.status === 'To Do' || t.status === 'In Progress' || t.status === 'Pending Approval'),
  )
  if (siblingsActive.length > 0) return

  // Per-item gate check: after AND-join clears for any per-item task, run the item-level
  // gate check. maybeUnlockCallClient returns early if not all [gate] tasks are Completed.
  if (task.projectItem?.[0]) {
    await maybeUnlockCallClient(projectId, task.projectItem[0])
  }

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
  const samePath = lockedTasks.filter(
    (t) =>
      (t.pathCondition ?? null) === taskPath &&
      (t.templateOrder?.[0] ?? 0) > completedOrder,
  )
  if (samePath.length === 0) return

  const orders = samePath
    .map((t) => t.templateOrder?.[0])
    .filter((o): o is number => typeof o === 'number')
  if (orders.length === 0) return

  const minOrder = Math.min(...orders)
  const toUnlock = samePath.filter((t) => (t.templateOrder?.[0] ?? Infinity) === minOrder)

  // If the next task(s) in the chain are gate-controlled, stop here —
  // they unlock exclusively via maybeUnlockCallClient when all [gate] tasks complete.
  const isGateControlled = toUnlock.some(
    (t) =>
      t.taskName.toLowerCase().startsWith(CALL_CLIENT_PREFIX) ||
      t.taskName.toLowerCase().startsWith(TAKE_APPROVAL_PREFIX),
  )
  if (isGateControlled) return

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
      // "Send to SED & Fixing Team" is a fabrication-completion signal — send a
      // targeted, human-readable alert to SED and installation instead of a task
      // notification, since the task itself is invisible (auto-completed immediately).
      if (t.taskName.toLowerCase().includes('send to sed') && t.taskName.toLowerCase().includes('fixing team')) {
        for (const role of ['sed', 'installation'] as const) {
          createNotification({
            recipientRole: role,
            title: `Fabrication complete — 2 days to check items & tools`,
            body: `Items for project ${projectLabel} are ready. Verify all items and tools before delivery.`,
            link: ROLE_DASHBOARD[role],
          })
        }
        continue
      }
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

async function maybeGeneratePhase3(task: Task): Promise<void> {
  if (task.templateOrder?.[0] !== PHASE_CONFIG.Working.triggerOrder) return
  const itemId = task.projectItem?.[0]
  const projectId = task.project?.[0]
  if (!itemId || !projectId) return

  const { todoTemplates } = await generatePhase3TasksForItem(projectId, itemId)
  const projectRef = task.projectId ?? projectId
  notifyTasksReady(
    todoTemplates.map((t) => ({ taskName: t.taskName, departments: t.department ?? [] })),
    `Phase 3 started for item (${projectRef})`,
  )
}

async function maybeGeneratePhase4(task: Task): Promise<void> {
  if (!task.taskName.toLowerCase().startsWith(PHASE_CONFIG.Closing.triggerTaskPrefix)) return
  const projectId = task.project?.[0]
  if (!projectId) return

  const { todoTemplates } = await generatePhase4Tasks(projectId)
  if (todoTemplates.length === 0) return

  const projectRef = task.projectId ?? projectId
  notifyTasksReady(
    todoTemplates.map((t) => ({ taskName: t.taskName, departments: t.department ?? [] })),
    `Phase 4 — Closing started for project ${projectRef}`,
  )
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

      // F1 is an info-capture intake form — it completes directly, no manager review needed
      const isF1Task = task.taskName.toLowerCase().startsWith('f1 —')

      if (needsReview && !alreadyApproved && !isF1Task) {
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
      maybeGeneratePhase3(task).catch((err) => console.error('[P3-GEN]', err))
      maybeGeneratePhase4(task).catch((err) => console.error('[P4-GEN]', err))

      // After F4 (advance payment), notify SED to submit quotation line items (F5)
      if (task.taskName.toLowerCase().startsWith('f4 —')) {
        const projectRef = task.projectId ?? task.project?.[0] ?? ''
        createNotification({
          recipientRole: 'sed',
          title: `Submit quotation details (F5) — ${projectRef}`,
          body: `Advance payment has been recorded. Please open F5 in the project to submit the quotation line items.`,
          link: ROLE_DASHBOARD['sed'],
        })
      }

      // After F5 (quotation details by item), notify manager, fabrication, installation, superadmin
      if (task.taskName.toLowerCase().startsWith('f5 —')) {
        const projectRef = task.projectId ?? task.project?.[0] ?? ''
        const f5Body = `SED has submitted the quotation line items and chosen actions per item. Review the project to proceed.`
        for (const role of ['manager', 'fabrication', 'installation', 'superadmin'] as const) {
          createNotification({
            recipientRole: role,
            title: `Quotation details submitted (F5) — ${projectRef}`,
            body: f5Body,
            link: ROLE_DASHBOARD[role],
          })
        }
      }

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
      maybeGeneratePhase3(task).catch((err) => console.error('[P3-GEN]', err))
      maybeGeneratePhase4(task).catch((err) => console.error('[P4-GEN]', err))
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

      if (outcome === 'approved') {
        // Only mark Completed when approved — for review/refused the task resets to Locked
        // so it can be re-triggered when all gates clear again next round.
        await updateTaskRaw(taskId, {
          [TASKS.STATUS]: 'Completed' as TaskStatus,
          [TASKS.COMPLETED_AT]: new Date().toISOString(),
        })
      }

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

        // Universal tasks within the Phase 1 action range (gateway through notification)
        const { universalActionOrderMin, universalActionOrderMax } = PHASE_CONFIG.Preparing
        const universalAction = actionTasks.filter(
          (t) =>
            !t.pathCondition &&
            typeof t.templateOrder?.[0] === 'number' &&
            t.templateOrder[0] >= universalActionOrderMin &&
            t.templateOrder[0] < universalActionOrderMax,
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

        // Reset the Call the Client task back to Locked so it re-triggers when all gates clear again
        resets.push(updateTaskRaw(taskId, { [TASKS.STATUS]: 'Locked' as TaskStatus }))

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
        // Refused — complete the task (decision is final) and mark project not-approved
        await updateTaskRaw(taskId, {
          [TASKS.STATUS]: 'Completed' as TaskStatus,
          [TASKS.COMPLETED_AT]: new Date().toISOString(),
        })
        await updateProject(projectId, { [PROJECTS.PROJECT_STAGE]: 'Not-Approved' })
      }
    })(),
  )
}

export async function handleOrderSampleBranch(
  taskId: string,
  hasMaterial: boolean,
): Promise<{ finalStatus: TaskStatus }> {
  return withTimeout(
    (async () => {
      const task = await getTaskById(taskId)
      const projectId = task.project?.[0] ?? task.projectRecordId
      if (!projectId) throw new Error('Task has no linked project')

      // hasMaterial=true → task is done, fabrication starts immediately
      // hasMaterial=false → waiting for ordered material to arrive; stays In Progress
      const newStatus: TaskStatus = hasMaterial ? 'Completed' : 'In Progress'
      const updateFields: Record<string, unknown> = { [TASKS.STATUS]: newStatus }
      if (hasMaterial) updateFields[TASKS.COMPLETED_AT] = new Date().toISOString()
      await updateTaskRaw(taskId, updateFields)

      // Scope branch lookup: per-item tasks use the same item; general tasks use project-level only
      const allBranchTasks = await getLockedBranchTasksForProject(projectId)
      const itemId = task.projectItem?.[0]
      const branchTasks = itemId
        ? allBranchTasks.filter((t) => t.projectItem?.[0] === itemId)
        : allBranchTasks.filter((t) => !t.projectItem?.length)

      if (branchTasks.length === 0) {
        // Branches already unlocked or don't exist yet — Order Sample status already updated, proceed
        return { finalStatus: newStatus }
      }

      // Match by keyword — case-insensitive, apostrophe-independent
      const chosenKeyword = hasMaterial ? 'we have material' : 'have material'
      const excludeKeyword = hasMaterial ? undefined : 'we have material'
      const toUnlock = branchTasks.filter((t) => {
        const lower = t.taskName.toLowerCase()
        if (!lower.includes(chosenKeyword)) return false
        if (excludeKeyword && lower.includes(excludeKeyword)) return false
        return true
      })

      if (toUnlock.length === 0) {
        // No matching project-level branch found — proceed without unlocking
        return { finalStatus: newStatus }
      }

      await Promise.all(
        toUnlock.map((t) => updateTaskRaw(t.id, { [TASKS.STATUS]: 'To Do' as TaskStatus })),
      )

      const projectRef = task.projectId ?? projectId
      for (const t of toUnlock) {
        const depts = t.department ?? []
        const roles = depts
          .map((d) => DEPT_ROLE_MAP[d])
          .filter((r): r is string => Boolean(r))
        const uniqueRoles = Array.from(new Set(roles.length > 0 ? roles : ['manager']))
        for (const role of uniqueRoles) {
          createNotification({
            recipientRole: role,
            title: `New task ready: ${t.taskName}`,
            body: `Completed: ${task.taskName} (${projectRef})`,
            link: ROLE_DASHBOARD[role] ?? '/dashboard/mgr',
          })
        }
      }

      return { finalStatus: newStatus }
    })(),
  )
}

export async function handleF3Order(input: {
  taskId: string
  path: 'small' | 'big'
  items: Array<{ name: string; quantity: number; unit: string; supplier?: string; neededByDate?: string; notes?: string }>
  generalNotes?: string
  requestedBy: string
}): Promise<{ created: number; finalStatus: TaskStatus }> {
  return withTimeout(
    (async () => {
      const task = await getTaskById(input.taskId)
      const projectId = task.project?.[0]
      if (!projectId) throw new Error('Task has no linked project')

      const today = new Date().toISOString().slice(0, 10)
      const projectRef = task.projectId ?? task.projectName ?? projectId

      const materials = await createMaterialOrder({
        purpose: 'Project',
        projectId,
        projectItemId: task.projectItem?.[0],
        requestedBy: input.requestedBy,
        requestDate: today,
        items: input.items,
      })

      const notifyBody = `F3 material order submitted for ${projectRef}. ${materials.length} item(s) added — status: ${input.path === 'small' ? '"Not ordered" — ready for procurement' : '"Pending approval" — awaiting fabrication store check'}.${input.generalNotes ? `\nNotes: ${input.generalNotes}` : ''}`

      if (input.path === 'small') {
        await updateTaskRaw(input.taskId, {
          [TASKS.STATUS]: 'Completed' as TaskStatus,
          [TASKS.COMPLETED_AT]: new Date().toISOString(),
        })
        await unlockNextTasks(task)

        // "Store Revised Material List (Big Orders Only)" is irrelevant for small orders.
        // Auto-complete it so the AND-join at order 32 clears and order 33 unlocks when
        // manager completes "All Material Estimation Price".
        const itemId = task.projectItem?.[0]
        if (itemId) {
          const allTasks = await getAllTasksForProjectAll(projectId)
          const storeTask = allTasks.find(
            (t) =>
              t.taskName.toLowerCase().startsWith('store revised material list') &&
              t.projectItem?.[0] === itemId &&
              (t.status === 'To Do' || t.status === 'Locked'),
          )
          if (storeTask) {
            await updateTaskRaw(storeTask.id, {
              [TASKS.STATUS]: 'Completed' as TaskStatus,
              [TASKS.COMPLETED_AT]: new Date().toISOString(),
            })
            await unlockNextTasks(storeTask)
          }
        }

        createNotification({ recipientRole: 'superadmin', title: `F3 Small Order — ${projectRef}`, body: notifyBody, link: ROLE_DASHBOARD['superadmin'] })
        createNotification({ recipientRole: 'manager', title: `F3 Small Order — ${projectRef}`, body: notifyBody, link: '/dashboard/mgr?view=materials' })
        return { created: materials.length, finalStatus: 'Completed' as TaskStatus }
      } else {
        await updateTaskRaw(input.taskId, {
          [TASKS.STATUS]: 'In Progress' as TaskStatus,
          [TASKS.STARTED_AT]: new Date().toISOString(),
        })
        const fabBody = `F3 Big Order for ${projectRef}: please check the store for ${materials.length} item(s) marked "Pending approval" in the materials list and confirm what needs ordering.${input.generalNotes ? `\nManager notes: ${input.generalNotes}` : ''}`
        createNotification({ recipientRole: 'fabrication', title: `Store Check Required — F3 for ${projectRef}`, body: fabBody, link: ROLE_DASHBOARD['fabrication'] })
        createNotification({ recipientRole: 'manager', title: `F3 Big Order pending store check — ${projectRef}`, body: `Materials submitted and awaiting fabrication store check.`, link: '/dashboard/mgr?view=materials' })
        return { created: materials.length, finalStatus: 'In Progress' as TaskStatus }
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
