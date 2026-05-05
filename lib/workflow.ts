import { TASKS } from './fieldMap'
import {
  getTaskById,
  updateTaskRaw,
  getLockedTasksForScope,
} from './airtable'
import { Task, TaskStatus } from './types'

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
  const itemId = task.projectItem?.[0]

  if (!projectId) return

  const lockedTasks = await getLockedTasksForScope(projectId, itemId)
  if (lockedTasks.length === 0) return

  const orders = lockedTasks
    .map((t) => t.templateOrder?.[0])
    .filter((o): o is number => typeof o === 'number')

  if (orders.length === 0) return

  const minOrder = Math.min(...orders)

  const toUnlock = lockedTasks.filter((t) => (t.templateOrder?.[0] ?? Infinity) === minOrder)

  await Promise.all(
    toUnlock.map((t) =>
      updateTaskRaw(t.id, { [TASKS.STATUS]: 'To Do' as TaskStatus }),
    ),
  )
}

export async function handleTaskCompletion(
  taskId: string,
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
