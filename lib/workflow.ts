import { TASKS, PROJECTS } from './fieldMap'
import {
  getTaskById,
  updateTaskRaw,
  updateProject,
  getProjectById,
  getLockedTasksForScope,
} from './airtable'
import { Task, TaskStatus } from './types'
import { notifyManager, notifyManagerEscalation } from './email'

const WORKFLOW_TIMEOUT_MS = 15_000

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

async function unlockNextTasks(task: Task): Promise<void> {
  const projectId = task.project?.[0]
  if (!projectId) return

  const lockedTasks = await getLockedTasksForScope(projectId, task.projectItem?.[0])
  if (lockedTasks.length === 0) return

  const taskPath = task.pathCondition ?? null

  // Only unlock tasks in the same path (universal tasks form their own "null" path)
  const samePath = lockedTasks.filter((t) => (t.pathCondition ?? null) === taskPath)
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
  await withTimeout(
    updateTaskRaw(taskId, {
      [TASKS.STATUS]: 'To Do' as TaskStatus,
    }),
  )
}

export async function handleCallCountEscalation(task: Task): Promise<void> {
  const projectId = task.project?.[0]
  if (!projectId) return

  const project = await withTimeout(getProjectById(projectId))
  if (project.approvalStatus === 'Not-Approved') return

  await withTimeout(
    updateProject(projectId, {
      [PROJECTS.APPROVAL_STATUS]: 'Not-Approved',
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
