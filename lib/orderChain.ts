// Pure per-scope unlock decision for the task order chain.
//
// Kept free of any Airtable/side-effect imports so it can be unit-tested directly and
// reused by lib/workflow.ts. The core rules:
//   • Strict scope separation — a per-item completion only considers that item's tasks;
//     a project-level completion only considers project-level tasks. Items are therefore
//     independent: one item never gates or unlocks another.
//   • Ordering guard — a task at order N unlocks only when EVERY task in the same scope
//     with a lower order is "done" (across all paths), so an order-N step waits for the
//     order-(N-1) fabrication step and any lower-order Carpentry/Paint.

import { Task } from './types'

const FAB_ITEM_PATHS = new Set(['Carpentry', 'Paint'])

// Carpentry/Paint item-level tasks are optional fabrication BRANCHES, identified by their
// pathCondition OR — since Phase-3 per-item generation creates them without one — by name
// ("Carpentry (item-level)" / "Paint (item-level)"). The only real fabrication gate is the
// "Fabrication Done" step; the branches must never hold up the order-40 AND-join.
function isFabBranch(t: Task): boolean {
  if (t.pathCondition && FAB_ITEM_PATHS.has(t.pathCondition)) return true
  const name = t.taskName.toLowerCase()
  return name.startsWith('carpentry') || name.startsWith('paint')
}

// A task is "done" (non-blocking for the order guard) when Completed or explicitly optional.
// Carpentry/Paint fabrication branches never block, whatever their status — so once
// "Fabrication Done" completes the chain advances even if a branch is untouched or mid-work.
// Every other gateway alternative keeps its original behaviour: an unchosen (To Do) or
// abandoned-downstream (Locked) path doesn't block, but one being actively worked still does.
export function isTaskDone(t: Task): boolean {
  if (t.status === 'Completed') return true
  if (t.taskName.toLowerCase().includes('optional')) return true
  if (isFabBranch(t)) return true
  if (t.pathCondition && (t.status === 'To Do' || t.status === 'Locked')) return true
  return false
}

export interface UnlockPlan {
  /** Tasks in the completed task's scope (its item, or project-level). */
  scopeTasks: Task[]
  /** True when an earlier step in the same scope is still open — advancement must wait. */
  blocked: boolean
  /** Tasks to flip Locked → To Do next (empty when blocked or nothing follows). */
  toUnlock: Task[]
  /** The next order to unlock (Infinity when nothing follows in this scope/path). */
  minOrder: number
}

export function planUnlock(
  task: Task,
  allProjectTasks: Task[],
  perItemOrderMin: number,
): UnlockPlan {
  const completedOrder = task.templateOrder?.[0] ?? 0
  const taskPath = task.pathCondition ?? null
  const itemId = task.projectItem?.[0]

  const inScope = (t: Task) => (itemId ? t.projectItem?.[0] === itemId : !t.projectItem?.length)
  const scopeTasks = allProjectTasks.filter(inScope)

  const isPhase3PerItem = !!itemId && completedOrder >= perItemOrderMin

  // Candidate next tasks: locked, later in the chain, same path (Phase 3 also surfaces
  // the Carpentry/Paint item paths alongside the universal fabrication step).
  const lockedLater = scopeTasks.filter(
    (t) =>
      t.status === 'Locked' &&
      ((t.pathCondition ?? null) === taskPath ||
        (isPhase3PerItem && FAB_ITEM_PATHS.has(t.pathCondition ?? ''))) &&
      (t.templateOrder?.[0] ?? 0) > completedOrder,
  )
  const orders = lockedLater
    .map((t) => t.templateOrder?.[0])
    .filter((o): o is number => typeof o === 'number')
  const minOrder = orders.length > 0 ? Math.min(...orders) : Infinity

  // Ordering guard: never unlock `minOrder` while any lower-order task in scope is open.
  // The triggering task itself is excluded (as in the pre-refactor guard): some flows
  // advance the chain while deliberately leaving the trigger open — e.g. the F3 "big
  // order" branch keeps F3 In Progress (store check happens on a separate task) but must
  // still unlock the order-32 AND-join. Without self-exclusion the freshly-refetched
  // trigger always counts as an unmet blocker and the chain deadlocks.
  const blocked = scopeTasks.some(
    (t) => t.id !== task.id && (t.templateOrder?.[0] ?? Infinity) < minOrder && !isTaskDone(t),
  )
  const toUnlock = blocked
    ? []
    : lockedLater.filter((t) => (t.templateOrder?.[0] ?? Infinity) === minOrder)

  return { scopeTasks, blocked, toUnlock, minOrder }
}
