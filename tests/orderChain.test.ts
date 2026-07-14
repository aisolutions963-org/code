import { describe, it, expect } from 'vitest'
import { planUnlock, isTaskDone } from '@/lib/orderChain'
import type { Task, TaskStatus } from '@/lib/types'

// Minimal Task factory — only the fields planUnlock reads.
let idCounter = 0
function mk(
  order: number,
  status: TaskStatus,
  opts: { item?: string; path?: string | null; name?: string } = {},
): Task {
  return {
    id: `t${idCounter++}`,
    taskName: opts.name ?? `Task ${order}`,
    status,
    department: [],
    taskOrder: [],
    templateOrder: [order],
    projectItem: opts.item ? [opts.item] : undefined,
    pathCondition: opts.path ?? undefined,
  } as unknown as Task
}

const PER_ITEM_MIN = 30

describe('isTaskDone', () => {
  it('Completed is done', () => expect(isTaskDone(mk(1, 'Completed'))).toBe(true))
  it('optional-named task is done regardless of status', () =>
    expect(isTaskDone(mk(1, 'Locked', { name: 'Fabricate if Missing (Optional)' }))).toBe(true))
  it('unchosen path alternative (To Do + pathCondition) is done', () =>
    expect(isTaskDone(mk(40, 'To Do', { path: 'Carpentry' }))).toBe(true))
  it('In Progress is NOT done', () => expect(isTaskDone(mk(1, 'In Progress'))).toBe(false))
  it('plain To Do (no path) is NOT done', () => expect(isTaskDone(mk(1, 'To Do'))).toBe(false))
  it('Locked (no path) is NOT done', () => expect(isTaskDone(mk(1, 'Locked'))).toBe(false))
  it('Locked + pathCondition (abandoned gateway alternative) is done', () =>
    expect(isTaskDone(mk(4, 'Locked', { path: 'Order Sample' }))).toBe(true))
  it('In Progress gateway choice (non-fab path) is done — must not block the chain', () =>
    expect(isTaskDone(mk(24, 'In Progress', { path: 'Select Sample (item)' }))).toBe(true))
  it('In Progress fabrication path (Carpentry/Paint) is NOT done — real work blocks', () => {
    expect(isTaskDone(mk(40, 'In Progress', { path: 'Carpentry' }))).toBe(false)
    expect(isTaskDone(mk(40, 'In Progress', { path: 'Paint' }))).toBe(false)
  })
})

describe('planUnlock — In-Progress Phase-2 gateway chips do not block (regression: tables item)', () => {
  it('unlocks Click Done (29) after Take Approval (28) even with In-Progress order-24 gateway chips', () => {
    const takeApproval = mk(28, 'Completed', { item: 'tables' })
    const tasks = [
      takeApproval,
      mk(24, 'In Progress', { item: 'tables', path: 'Select Sample (item)' }),
      mk(24, 'In Progress', { item: 'tables', path: 'Site Visit (item)' }),
      mk(26, 'Completed', { item: 'tables', name: '[GATE] Sample Approved' }),
      mk(26, 'Completed', { item: 'tables', name: '[GATE] Design Approved' }),
      mk(29, 'Locked', { item: 'tables' }), // Click Done — must unlock
    ]
    const plan = planUnlock(takeApproval, tasks, PER_ITEM_MIN)
    expect(plan.blocked).toBe(false)
    expect(plan.toUnlock.map((t) => t.templateOrder[0])).toEqual([29])
  })
})

describe('planUnlock — single item ordering', () => {
  it('unlocks the immediate next order when the completed step is the only lower one', () => {
    const done = mk(38, 'Completed', { item: 'A' })
    const tasks = [done, mk(40, 'Locked', { item: 'A' }), mk(41, 'Locked', { item: 'A' })]
    const plan = planUnlock(done, tasks, PER_ITEM_MIN)
    expect(plan.blocked).toBe(false)
    expect(plan.toUnlock.map((t) => t.templateOrder[0])).toEqual([40])
  })

  it('does NOT unlock order 41 while an order-40 fabrication task is still In Progress (the leak)', () => {
    // Completed the null-path fabrication at 40; a Carpentry path at 40 is still In Progress.
    const done = mk(40, 'Completed', { item: 'A', path: null })
    const tasks = [
      done,
      mk(40, 'In Progress', { item: 'A', path: 'Carpentry' }),
      mk(41, 'Locked', { item: 'A', path: null }),
    ]
    const plan = planUnlock(done, tasks, PER_ITEM_MIN)
    expect(plan.blocked).toBe(true)
    expect(plan.toUnlock).toEqual([])
  })

  it('unchosen Carpentry/Paint (To Do + path) at order 40 does NOT block order 41', () => {
    const done = mk(40, 'Completed', { item: 'A', path: null })
    const tasks = [
      done,
      mk(40, 'To Do', { item: 'A', path: 'Carpentry' }), // unchosen → done
      mk(40, 'To Do', { item: 'A', path: 'Paint' }), // unchosen → done
      mk(41, 'Locked', { item: 'A', path: null }),
    ]
    const plan = planUnlock(done, tasks, PER_ITEM_MIN)
    expect(plan.blocked).toBe(false)
    expect(plan.toUnlock.map((t) => t.templateOrder[0])).toEqual([41])
  })
})

describe('planUnlock — In-Progress trigger advances the chain (regression: F3 big-order stall)', () => {
  it('the triggering task itself does not block even when left In Progress', () => {
    // F3 big-order branch: F3 (order 31) stays In Progress by design but must still
    // unlock the order-32 AND-join. The trigger must be excluded from the blocked scan.
    const f3 = mk(31, 'In Progress', { item: 'A', name: 'F3 — Fill Order Material Form' })
    const tasks = [
      f3,
      mk(32, 'Locked', { item: 'A', name: 'Store Revised Material List (Big Orders Only)' }),
      mk(32, 'Locked', { item: 'A', name: 'All Material Estimation Price' }),
      mk(33, 'Locked', { item: 'A' }),
    ]
    const plan = planUnlock(f3, tasks, PER_ITEM_MIN)
    expect(plan.blocked).toBe(false)
    expect(plan.toUnlock.map((t) => t.templateOrder[0])).toEqual([32, 32])
  })

  it('a DIFFERENT still-open lower-order task keeps blocking (self-exclusion is narrow)', () => {
    const f3 = mk(31, 'In Progress', { item: 'A', name: 'F3 — Fill Order Material Form' })
    const other = mk(30, 'In Progress', { item: 'A' }) // genuinely open earlier step
    const tasks = [f3, other, mk(32, 'Locked', { item: 'A' })]
    const plan = planUnlock(f3, tasks, PER_ITEM_MIN)
    expect(plan.blocked).toBe(true)
    expect(plan.toUnlock).toEqual([])
  })
})

describe('planUnlock — abandoned gateway paths do not block (regression: F4 stuck bug)', () => {
  it('an abandoned Locked gateway alternative at an earlier order does not block a later project-level unlock', () => {
    // Mirrors the live recY7JJNZd0s3LGMV bug: order-4 "Need More Details From Client"
    // (a gateway path never chosen) sits Locked forever; F4 (order 20, path null)
    // completes; order 22 must still unlock.
    const abandoned = mk(4, 'Locked', { path: 'Need More Details' })
    const done = mk(20, 'Completed', { path: null })
    const tasks = [abandoned, done, mk(22, 'Locked', { path: null })]
    const plan = planUnlock(done, tasks, PER_ITEM_MIN)
    expect(plan.blocked).toBe(false)
    expect(plan.toUnlock.map((t) => t.templateOrder[0])).toEqual([22])
  })

  it('a plain Locked task with no path still blocks (universal chain intact)', () => {
    const stillLocked = mk(19, 'Locked') // no path — genuinely not yet reached
    const done = mk(20, 'Completed', { path: null })
    const tasks = [stillLocked, done, mk(22, 'Locked', { path: null })]
    const plan = planUnlock(done, tasks, PER_ITEM_MIN)
    expect(plan.blocked).toBe(true)
    expect(plan.toUnlock).toEqual([])
  })
})

describe('planUnlock — items advance independently', () => {
  it("completing item A's step never unlocks item B's tasks", () => {
    const doneA = mk(40, 'Completed', { item: 'A', path: null })
    const tasks = [
      doneA,
      mk(41, 'Locked', { item: 'A', path: null }),
      // Item B is behind — its lower-order work is still open, but it must be untouched.
      mk(38, 'In Progress', { item: 'B', path: null }),
      mk(41, 'Locked', { item: 'B', path: null }),
    ]
    const plan = planUnlock(doneA, tasks, PER_ITEM_MIN)
    expect(plan.blocked).toBe(false)
    // Only item A's order-41 unlocks; item B's order-41 stays locked.
    expect(plan.toUnlock.map((t) => t.id)).toEqual([tasks[1].id])
    expect(plan.scopeTasks.every((t) => t.projectItem?.[0] === 'A')).toBe(true)
  })

  it("item B being behind does not block item A", () => {
    const doneA = mk(38, 'Completed', { item: 'A', path: null })
    const tasks = [
      doneA,
      mk(40, 'Locked', { item: 'A', path: null }),
      mk(30, 'In Progress', { item: 'B', path: null }), // B far behind, still open
    ]
    const plan = planUnlock(doneA, tasks, PER_ITEM_MIN)
    expect(plan.blocked).toBe(false)
    expect(plan.toUnlock.map((t) => t.templateOrder[0])).toEqual([40])
  })
})

describe('planUnlock — scope isolation', () => {
  it('a project-level completion never touches per-item tasks', () => {
    const doneProj = mk(20, 'Completed', { path: null }) // no item = project-level
    const tasks = [
      doneProj,
      mk(21, 'Locked', { path: null }), // project-level next
      mk(40, 'Locked', { item: 'A', path: null }), // per-item — must be ignored
    ]
    const plan = planUnlock(doneProj, tasks, PER_ITEM_MIN)
    expect(plan.scopeTasks.every((t) => !t.projectItem?.length)).toBe(true)
    expect(plan.toUnlock.map((t) => t.templateOrder[0])).toEqual([21])
  })
})
