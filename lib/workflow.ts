import { TASKS, PROJECTS } from './fieldMap'
import { todayUAE } from './dateUtils'
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
  createMaintenanceRecord,
  activateMaintenanceRecord,
  getMaintenanceRecordForProject,
  createMaterialOrder,
  CR_TASK_SEQUENCE,
  applyClosingStageTransition,
} from './airtable'
import { Task, TaskStatus } from './types'
import { notifyManagerEscalation, notifyCallClient, notifyAccountantEvent, notifyAutoTaskEvent } from './email'
import { createNotification, notifyTasksReady, DEPT_ROLE_MAP, ROLE_DASHBOARD, isArabicRole, arTaskReady, pickForRole } from './notifications'
import { PHASE_CONFIG, TASK_MARKERS, isAutoTask, isHeadlineTask } from './phases'
import { planUnlock, isTaskDone } from './orderChain'

const WORKFLOW_TIMEOUT_MS = 15_000
const { CALL_CLIENT_PREFIX, GATE_PREFIX, TAKE_APPROVAL_PREFIX } = TASK_MARKERS

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

async function resolveProjectLabel(task: Task): Promise<string> {
  if (task.projectId && !task.projectId.startsWith('rec')) return task.projectId
  if (task.projectRef && !task.projectRef.startsWith('rec')) return task.projectRef
  const recordId = task.project?.[0] ?? task.projectRecordId
  if (!recordId) return ''
  try {
    const p = await getProjectById(recordId)
    return p.nickname ?? p.projectName ?? (p.projectId || recordId)
  } catch {
    return recordId
  }
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
    await createNotification({
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
    await createNotification({
      recipientRole: 'superadmin',
      title: `Action required: ${callClientTask.taskName}`,
      body: 'All approval gates cleared — call the client to confirm the project.',
      link: ROLE_DASHBOARD['superadmin'],
    })
    await createNotification({
      recipientRole: 'sed',
      title: `All gates approved — awaiting client call`,
      body: 'Quotation, sample, and design all approved. Superadmin will now call the client.',
      link: ROLE_DASHBOARD['sed'],
    })
    if (process.env.MANAGER_EMAIL && process.env.RESEND_API_KEY) {
      getProjectById(projectId)
        .then((project) =>
          notifyCallClient({
            projectName: project.projectName,
            projectId: project.projectId,
            clientName: project.clientName,
          }),
        )
        .catch((err) => console.error('[A13] notifyCallClient failed:', err))
    }
  }
}

export async function unlockNextTasks(task: Task): Promise<void> {
  const projectId = task.project?.[0]
  if (!projectId) return

  // GATE/LOOP tasks (no templateOrder) only trigger the call-client gate check,
  // not the standard order chain. Exception: client request tasks (Trade/Maintenance)
  // have fixed task names — use a name→position map to drive sequential unlock.
  if ((task.templateOrder ?? []).length === 0) {
    const crPosition = CR_TASK_SEQUENCE[task.taskName]
    if (crPosition !== undefined) {
      const [allCrTasks, crProjectLabel] = await Promise.all([
        getAllTasksForProjectAll(projectId),
        resolveProjectLabel(task),
      ])
      const nextTask = allCrTasks
        .filter(
          (t) =>
            t.status === 'Locked' &&
            CR_TASK_SEQUENCE[t.taskName] !== undefined &&
            CR_TASK_SEQUENCE[t.taskName] > crPosition,
        )
        .sort((a, b) => CR_TASK_SEQUENCE[a.taskName] - CR_TASK_SEQUENCE[b.taskName])[0]
      if (nextTask) {
        await updateTaskRaw(nextTask.id, { [TASKS.STATUS]: 'To Do' as TaskStatus })
        const depts = nextTask.department ?? []
        const roles = depts.map((d) => DEPT_ROLE_MAP[d]).filter((r): r is string => Boolean(r))
        const uniqueRoles = Array.from(new Set(roles.length > 0 ? roles : ['manager']))
        for (const role of uniqueRoles) {
          const text = isArabicRole(role)
            ? arTaskReady(role, { taskName: nextTask.taskName, arabicName: nextTask.arabicName?.[0], arabicInstructions: nextTask.arabicInstructions })
            : { title: `New task ready: ${nextTask.taskName}`, body: `Project ${crProjectLabel}` }
          await createNotification({
            recipientRole: role,
            title: text.title,
            body: text.body,
            link: ROLE_DASHBOARD[role] ?? '/dashboard/mgr',
          })
        }
      }
      return
    }
    await maybeUnlockCallClient(projectId, task.projectItem?.[0])
    return
  }

  // Fetch all tasks once — used for AND-join check and locked task discovery.
  const allProjectTasks = await getAllTasksForProjectAll(projectId)

  // Strict scope separation + ordering guard live in a pure, unit-tested helper:
  // a per-item completion only advances that item; a project-level completion only
  // advances project-level tasks; and order N waits for every lower-order task in scope.
  const plan = planUnlock(task, allProjectTasks, PHASE_CONFIG.Working.perItemOrderMin)

  // Per-item gate check runs REGARDLESS of the order-chain block: "Take Approval" unlocks
  // as soon as all [gate] tasks for the item are Completed — this is independent of the
  // linear order chain. (If gated behind plan.blocked, an item with an unfinished
  // lower-order task keeps skipping the check, leaving Take Approval Locked even though
  // both gates are done — the reported bug.) maybeUnlockCallClient is idempotent and only
  // unlocks once every [gate] task is Completed.
  const itemId = task.projectItem?.[0]
  if (itemId) await maybeUnlockCallClient(projectId, itemId)

  // Order-chain advancement is still guarded: don't unlock the next linear step while an
  // earlier task in scope is open.
  if (plan.blocked) return

  const toUnlock = plan.toUnlock
  if (toUnlock.length === 0) return

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
  const autoComplete = toUnlock.filter((t) => isAutoTask(t.taskName))
  const projectLabel = await resolveProjectLabel(task)

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
    // Auto-completed closing tasks (e.g. order 57 "Change Project Status to Closed Project
    // List (auto)") carry the phase transition — apply it here since they never pass through
    // handleTaskCompletion.
    const autoProjectId = task.project?.[0]
    if (autoProjectId) {
      for (const t of autoComplete) {
        await applyClosingStageTransition(t.taskName, autoProjectId).catch((err) =>
          console.error('[CLOSE-STAGE-AUTO]', err),
        )
      }
    }
    // Notify each auto task's departments — they fire automatically but the
    // team still needs to know the event happened (e.g. "project is now Open").
    // Headline banners are purely visual and generate no notification.
    for (const t of autoComplete) {
      if (isHeadlineTask(t.taskName)) continue
      // "Send to SED & Fixing Team" is a fabrication-completion signal — send a
      // targeted, human-readable alert to SED and installation instead of a task
      // notification, since the task itself is invisible (auto-completed immediately).
      if (t.taskName.toLowerCase().includes('send to sed') && t.taskName.toLowerCase().includes('fixing team')) {
        for (const role of ['sed', 'installation'] as const) {
          const text = pickForRole(
            role,
            { title: `اكتمل التصنيع — يومان لفحص العناصر والأدوات`, body: `العناصر جاهزة لمشروع ${projectLabel}. تحقّق من جميع العناصر والأدوات قبل التسليم.` },
            { title: `Fabrication complete — 2 days to check items & tools`, body: `Items for project ${projectLabel} are ready. Verify all items and tools before delivery.` },
          )
          await createNotification({
            recipientRole: role,
            title: text.title,
            body: text.body,
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
      const title = t.taskName.replace(/\s*\(auto[^)]*\)\s*/gi, '').trim()
      const arTitle = (t.arabicName?.[0]?.trim() || title).replace(/\s*\(auto[^)]*\)\s*/gi, '').trim()
      for (const role of uniqueRoles) {
        const text = pickForRole(
          role,
          { title: arTitle, body: `المشروع: ${projectLabel}` },
          { title, body: `Project ${projectLabel}` },
        )
        await createNotification({
          recipientRole: role,
          title: text.title,
          body: text.body,
          link: ROLE_DASHBOARD[role] ?? '/dashboard/mgr',
        })
      }
      if (t.taskName.toLowerCase().includes('accountant') && process.env.RESEND_API_KEY) {
        notifyAccountantEvent({ eventName: title, projectLabel })
          .catch((err) => console.error('[A15] notifyAccountantEvent failed:', err))
      } else {
        notifyAutoTaskEvent({ taskName: title, projectLabel })
          .catch((err) => console.error('[AUTO-EMAIL]', err))
      }
    }
    // Trigger chain continuation once — all auto tasks are Completed so the
    // AND-join in the recursive call will pass cleanly.
    await unlockNextTasks(autoComplete[0])
  }

  // Send notifications only for real (non-auto) tasks that just unlocked.
  const realUnlocked = toUnlock.filter((t) => !isAutoTask(t.taskName))
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
      // Fabrication/installation: Arabic, driven by the NEW task's own Arabic name +
      // instructions (not the completed task's). Other roles keep the English "Completed: …".
      const text = isArabicRole(role)
        ? arTaskReady(role, { taskName: t.taskName, arabicName: t.arabicName?.[0], arabicInstructions: t.arabicInstructions })
        : {
            title: `New task ready: ${t.taskName}`,
            body: body
              ? `Completed: ${task.taskName} (${projectLabel})\n${body}`
              : `Completed: ${task.taskName} (${projectLabel})`,
          }
      await createNotification({
        recipientRole: role,
        title: text.title,
        body: text.body,
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

  // Advance project stage to Production on first P3 trigger (idempotent: only if still at Open or Preparing)
  const project = await getProjectById(projectId)
  if (project.projectStage === 'Preparing' || project.projectStage === 'Open') {
    await updateProject(projectId, { [PROJECTS.PROJECT_STAGE]: 'Production' })
  }

  const projectLabel = await resolveProjectLabel(task)
  await notifyTasksReady(
    todoTemplates.map((t) => ({ taskName: t.taskName, departments: t.department ?? [], arabicName: t.arabicName, arabicInstructions: t.arabicInstructions })),
    `Phase 3 started for item (${projectLabel})`,
  )
}

async function maybeGeneratePhase4(task: Task): Promise<void> {
  // Phase 4 (handover) is project-level and must wait until EVERY item has finished
  // its per-item installation. Installation tasks (Installation Day, Approval to
  // Complete Installation, Attach Site Photo, QC) are all per-item, so only a per-item
  // task completion can be the one that finishes the last item.
  if (!task.projectItem?.length) return
  const projectId = task.project?.[0]
  if (!projectId) return

  const allProjectTasks = await getAllTasksForProjectAll(projectId)
  const perItemTasks = allProjectTasks.filter((t) => (t.projectItem?.length ?? 0) > 0)
  if (perItemTasks.length === 0) return

  // An item's per-item task is "done" when Completed, an explicitly optional task, an
  // unchosen path alternative (Carpentry/Paint, or an abandoned per-item gateway path —
  // Select Sample / Measurement / Design / Site Visit — left Locked forever), via the
  // shared isTaskDone (lib/orderChain.ts). Everything else — a lagging item's own
  // not-yet-reached step (Locked, no path), In Progress, Pending Approval, or a plain
  // To-Do — means at least one item is still working, so the handover must not start yet.
  if (perItemTasks.some((t) => !isTaskDone(t))) return

  const { todoTemplates } = await generatePhase4Tasks(projectId)

  // Enter the Closing stage now that every item's installation is done and the handover
  // chain exists. Idempotent: only advance forward from Production.
  const closingProject = await getProjectById(projectId).catch(() => null)
  if (closingProject?.projectStage === 'Production') {
    await updateProject(projectId, { [PROJECTS.PROJECT_STAGE]: 'Closing' })
  }

  // Warranty clock starts when all per-item tasks finish, regardless of whether
  // Phase 4 tasks were pre-generated. Only create if record doesn't already exist.
  const existingMaintenance = await getMaintenanceRecordForProject(projectId).catch(() => null)
  if (!existingMaintenance) {
    const warrantyStart = new Date()
    const warrantyEnd = new Date(warrantyStart)
    warrantyEnd.setFullYear(warrantyEnd.getFullYear() + 1)
    createMaintenanceRecord(projectId, {
      startDate: warrantyStart.toISOString().slice(0, 10),
      endDate: warrantyEnd.toISOString().slice(0, 10),
      status: 'Pending',
    }).catch((err) => console.error('[WARRANTY] Failed to create maintenance record:', err))
  }

  if (todoTemplates.length === 0) return

  const projectLabel = await resolveProjectLabel(task)
  await notifyTasksReady(
    todoTemplates.map((t) => ({ taskName: t.taskName, departments: t.department ?? [], arabicName: t.arabicName, arabicInstructions: t.arabicInstructions })),
    `Phase 4 — Closing started for project ${projectLabel}`,
  )
}

export async function handleTaskCompletion(
  taskId: string,
  submittedBy?: string,
): Promise<{ finalStatus: TaskStatus }> {
  return withTimeout(
    (async () => {
      const task = await getTaskById(taskId)

      await updateTaskRaw(taskId, {
        [TASKS.STATUS]: 'Completed' as TaskStatus,
        [TASKS.COMPLETED_AT]: new Date().toISOString(),
      })

      await unlockNextTasks(task)
      // Await phase 3/4 generation. A detached (fire-and-forget) promise is unreliable on
      // serverless — once the completion response is sent the function context can freeze,
      // so the next phase's tasks would never be created. The .catch keeps a generation
      // failure from breaking the task completion itself (both are best-effort side effects).
      await maybeGeneratePhase3(task).catch((err) => console.error('[P3-GEN]', err))
      await maybeGeneratePhase4(task).catch((err) => console.error('[P4-GEN]', err))

      // Closing tasks completed manually (e.g. order 64 "Change Status to Closed and Valid
      // Maintenance") carry the phase transition — advance the project stage accordingly.
      const closingProjectId = task.project?.[0]
      if (closingProjectId) {
        await applyClosingStageTransition(task.taskName, closingProjectId).catch((err) =>
          console.error('[CLOSE-STAGE]', err),
        )
      }

      // After F4 (advance payment), notify SED to submit quotation line items (F5)
      if (task.taskName.toLowerCase().startsWith('f4 —')) {
        const projectLabel = await resolveProjectLabel(task)
        await createNotification({
          recipientRole: 'sed',
          title: `Submit quotation details (F5) — ${projectLabel}`,
          body: `Advance payment has been recorded. Please open F5 in the project to submit the quotation line items.`,
          link: ROLE_DASHBOARD['sed'],
        })
      }

      // After F5 (quotation details by item), notify manager, fabrication, installation, superadmin
      if (task.taskName.toLowerCase().startsWith('f5 —')) {
        const projectLabel = await resolveProjectLabel(task)
        const f5Body = `SED has submitted the quotation line items and chosen actions per item. Review the project to proceed.`
        for (const role of ['manager', 'fabrication', 'installation', 'superadmin'] as const) {
          const text = pickForRole(
            role,
            { title: `تم إرسال تفاصيل عرض السعر (F5) — ${projectLabel}`, body: `قام مسؤول المبيعات بإرسال بنود عرض السعر واختيار الإجراءات لكل عنصر. راجع المشروع للمتابعة.` },
            { title: `Quotation details submitted (F5) — ${projectLabel}`, body: f5Body },
          )
          await createNotification({
            recipientRole: role,
            title: text.title,
            body: text.body,
            link: ROLE_DASHBOARD[role],
          })
        }
      }

      // After "Order Material & Notification" task — notify superadmin, manager + email accountant
      const taskNameLower = task.taskName.toLowerCase()
      if (taskNameLower.includes('order material') && taskNameLower.includes('notification')) {
        const projectLabel = await resolveProjectLabel(task)
        for (const role of ['superadmin', 'manager'] as const) {
          await createNotification({
            recipientRole: role,
            title: `Material ordered — ${projectLabel}`,
            body: `A material order has been placed. Review in the materials dashboard.`,
            link: ROLE_DASHBOARD[role],
          })
        }
        if (process.env.RESEND_API_KEY) {
          notifyAccountantEvent({
            eventName: 'Material Ordered',
            projectLabel,
          }).catch((err) => console.error('[MaterialOrder] notifyAccountantEvent failed:', err))
        }
      }

      // Notify manager when an Installation or Fabrication task is completed,
      // so on-site / production progress isn't invisible until manually checked.
      const isSystemAuto = isAutoTask(task.taskName)
      const isFixingTeamNote =
        taskNameLower.startsWith('fixing team note') || task.taskName.startsWith('ملاحظة فريق التركيب')
      const completedDept = task.department?.find((d) => d === 'Installation' || d === 'Fabrication')
      if (completedDept && !isSystemAuto && !isFixingTeamNote) {
        const projectLabel = await resolveProjectLabel(task)
        await createNotification({
          recipientRole: 'manager',
          title: `${completedDept} task completed — ${projectLabel}`,
          body: `"${task.taskName}" was marked complete${submittedBy ? ` by ${submittedBy}` : ''}.`,
          link: ROLE_DASHBOARD['manager'],
          category: completedDept.toLowerCase(),
        })
      }

      return { finalStatus: 'Completed' as TaskStatus }
    })(),
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
            await notifyTasksReady(
              todoTemplates.map((t) => ({ taskName: t.taskName, departments: t.department, arabicName: t.arabicName, arabicInstructions: t.arabicInstructions })),
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
          const fields: Record<string, unknown> = { [TASKS.STATUS]: 'To Do' as TaskStatus }
          // Also clear the round-1 approval values on [GATE] tasks. The legacy field-based
          // checkAndUnlockCallClientTask (lib/airtable/tasks.ts) reads these directly on any
          // approval-field PATCH — stale 'Approved' values from before the review would let a
          // single re-approval re-unlock "Call the Client" while the other gates are unredone.
          if (t.taskName.toLowerCase().startsWith(GATE_PREFIX)) {
            fields[TASKS.CONCEPT_DESIGN_APPROVAL] = null
            fields[TASKS.SAMPLE_APPROVAL] = null
            fields[TASKS.QUOTATION_OUTCOME] = null
          }
          resets.push(updateTaskRaw(t.id, fields))
        }

        // Reset the Call the Client task back to Locked so it re-triggers when all gates clear again
        resets.push(updateTaskRaw(taskId, { [TASKS.STATUS]: 'Locked' as TaskStatus }))

        await Promise.all(resets)

        // Notify SED and manager that the client requested a review
        const projectRef = await resolveProjectLabel(task)
        const reviewBody = `Client requested review on project ${projectRef}. Phase 1 action tasks have been reset.`
        await createNotification({
          recipientRole: 'sed',
          title: 'Client requested review — action tasks reset',
          body: reviewBody,
          link: ROLE_DASHBOARD['sed'],
        })
        await createNotification({
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

      // Both branches keep the Order Sample task OPEN (In Progress). SED completes it
      // later, when they physically receive the finished sample back from fabrication.
      if (!hasMaterial) {
        // "Order Material" is a status marker only — SED returns and chooses
        // "Send to Fabrication" once the material has arrived.
        await updateTaskRaw(taskId, { [TASKS.STATUS]: 'In Progress' as TaskStatus })
        return { finalStatus: 'In Progress' as TaskStatus }
      }

      // "Send to Fabrication" — no task is created for fabrication. Instead we flag the
      // sample so it surfaces as a read-only card on the fabrication dashboard (with the
      // project details, notes and reference links), and notify them.
      await updateTaskRaw(taskId, {
        [TASKS.STATUS]: 'In Progress' as TaskStatus,
        [TASKS.SENT_TO_FAB_AT]: new Date().toISOString(),
      })

      // The workflow still has a hidden "Sample Branch: We Have Material — Fabrication"
      // step. Auto-complete it (Locked → Completed) so it never surfaces as a fabrication
      // to-do, while keeping the order chain intact — SED drives progression by marking
      // the Order Sample task complete once the finished sample is received.
      const itemId = task.projectItem?.[0]
      const branchTasks = await getLockedBranchTasksForProject(projectId)
      const fabBranch = branchTasks.filter(
        (t) =>
          (itemId ? t.projectItem?.[0] === itemId : !t.projectItem?.length) &&
          (t.taskName.toLowerCase().includes('we have material') ||
            t.taskName.toLowerCase().includes('fabricat')),
      )
      if (fabBranch.length > 0) {
        await Promise.all(
          fabBranch.map((t) =>
            updateTaskRaw(t.id, {
              [TASKS.STATUS]: 'Completed' as TaskStatus,
              [TASKS.COMPLETED_AT]: new Date().toISOString(),
            }),
          ),
        )
      }

      const projectLabel = await resolveProjectLabel(task)
      const sampleNote = task.sedNote?.trim()
      const linkCount = task.taskDocLinks?.length ?? 0
      const notifyBody =
        `عينة جاهزة للتصنيع لمشروع ${projectLabel}.` +
        (sampleNote ? `\nملاحظة: ${sampleNote}` : '') +
        (linkCount > 0 ? `\nتم إرفاق ${linkCount} رابط مرجعي — افتح لوحة التصنيع.` : '')

      await createNotification({
        recipientRole: 'fabrication',
        title: `عينة للتصنيع — ${projectLabel}`,
        body: notifyBody,
        link: ROLE_DASHBOARD['fabrication'] ?? '/dashboard/fab',
        category: 'fabrication',
      })

      return { finalStatus: 'In Progress' as TaskStatus }
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

      const today = todayUAE()
      const projectRef = await resolveProjectLabel(task)

      const materials = await createMaterialOrder({
        purpose: 'Project',
        projectId,
        projectItemId: task.projectItem?.[0],
        requestedBy: input.requestedBy,
        requestDate: today,
        items: input.items,
      })

      const notifyBody = `F3 material order submitted for ${projectRef}. ${materials.length} item(s) added — status: ${input.path === 'small' ? '"Not ordered" — ready for procurement' : '"Not ordered" — awaiting fabrication store check'}.${input.generalNotes ? `\nNotes: ${input.generalNotes}` : ''}`

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

        await createNotification({ recipientRole: 'superadmin', title: `F3 Small Order — ${projectRef}`, body: notifyBody, link: '/dashboard/superadmin?view=materials' })
        await createNotification({ recipientRole: 'manager', title: `F3 Small Order — ${projectRef}`, body: notifyBody, link: '/dashboard/mgr?view=materials' })
        return { created: materials.length, finalStatus: 'Completed' as TaskStatus }
      } else {
        await updateTaskRaw(input.taskId, {
          [TASKS.STATUS]: 'In Progress' as TaskStatus,
          [TASKS.STARTED_AT]: new Date().toISOString(),
          ...(input.generalNotes ? { [TASKS.SED_NOTE]: input.generalNotes } : {}),
        })
        // Big orders never reach "Completed" on this task (fabrication store check
        // happens on a separate task), but the order-32 AND-join (Store Revised
        // Material List / All Material Estimation Price) still needs unlocking here —
        // otherwise it stays Locked forever since only the "small" path used to unlock it.
        await unlockNextTasks(task)
        const fabBody = `طلب F3 كبير للمشروع ${projectRef}: يرجى التحقق من المخزن لعدد ${materials.length} عنصر معلّم بـ"غير مطلوبة" في قائمة المواد وتأكيد ما يلزم طلبه.${input.generalNotes ? `\nملاحظات المدير: ${input.generalNotes}` : ''}`
        const bigOrderBody = `F3 Big Order submitted for ${projectRef}. ${materials.length} item(s) pending fabrication store check.${input.generalNotes ? `\nNotes: ${input.generalNotes}` : ''}`
        await createNotification({ recipientRole: 'fabrication', title: `التحقق من المخزن مطلوب — F3 للمشروع ${projectRef}`, body: fabBody, link: ROLE_DASHBOARD['fabrication'] })
        await createNotification({ recipientRole: 'manager', title: `F3 Big Order pending store check — ${projectRef}`, body: bigOrderBody, link: '/dashboard/mgr?view=materials' })
        await createNotification({ recipientRole: 'superadmin', title: `F3 Big Order — ${projectRef}`, body: bigOrderBody, link: '/dashboard/superadmin?view=materials' })
        return { created: materials.length, finalStatus: 'In Progress' as TaskStatus }
      }
    })(),
  )
}

export async function handleStoreReview(input: {
  taskId: string
  notes: string
  submittedBy: string
}): Promise<{ finalStatus: TaskStatus }> {
  return withTimeout(
    (async () => {
      const task = await getTaskById(input.taskId)
      const projectRef = await resolveProjectLabel(task)

      await updateTaskRaw(input.taskId, {
        [TASKS.STATUS]: 'In Progress' as TaskStatus,
        [TASKS.STARTED_AT]: new Date().toISOString(),
        [TASKS.SED_NOTE]: input.notes,
      })

      const body = `Fabrication store review for ${projectRef}: ${input.notes}`
      await createNotification({ recipientRole: 'manager', title: `Store review submitted — ${projectRef}`, body, link: ROLE_DASHBOARD['manager'] })
      await createNotification({ recipientRole: 'sed', title: `Store review submitted — ${projectRef}`, body, link: ROLE_DASHBOARD['sed'] })

      return { finalStatus: 'In Progress' as TaskStatus }
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

