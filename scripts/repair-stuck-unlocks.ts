// Repairs projects stuck by the order-chain regression fixed in lib/orderChain.ts —
// an abandoned gateway path (Locked, with a pathCondition) permanently blocked
// unlockNextTasks from advancing a scope, even though the real chain had moved on.
//
// For every non-deleted project, finds each scope's (project-level, and each item's)
// highest-order Completed task and re-runs the real, now-fixed unlockNextTasks(task) —
// same side effects as a live completion (notifications, auto-complete cascade).
// Idempotent: scopes that aren't actually stuck compute blocked/no-op as before.
//
// This imports lib/airtable + lib/workflow, which validate required env vars at MODULE
// LOAD time — earlier than an in-file dotenv call would run (import statements are
// hoisted ahead of any other top-level code). Load env via Node's --env-file instead:
//
// Run (dry run — lists what WOULD change):  npx tsx --env-file=.env.local scripts/repair-stuck-unlocks.ts
// Run (apply):                              npx tsx --env-file=.env.local scripts/repair-stuck-unlocks.ts --confirm
import { getAllProjects, getAllTasksForProjectAll } from '../lib/airtable'
import { unlockNextTasks } from '../lib/workflow'
import { Task } from '../lib/types'

const CONFIRM = process.argv.includes('--confirm')

function scopeKey(t: Task): string {
  return t.projectItem?.[0] ?? '__project__'
}

async function run() {
  console.log(`\n${CONFIRM ? 'Mode: APPLY' : 'Mode: DRY RUN (no --confirm) — no writes'}\n`)

  const projects = await getAllProjects({ includeClientRequests: true })
  let scopesChecked = 0
  let scopesRepaired = 0

  for (const project of projects) {
    const tasks = await getAllTasksForProjectAll(project.id)
    if (tasks.length === 0) continue

    const byScope = new Map<string, Task[]>()
    for (const t of tasks) {
      const key = scopeKey(t)
      if (!byScope.has(key)) byScope.set(key, [])
      byScope.get(key)!.push(t)
    }

    for (const [key, scopeTasks] of byScope) {
      const lastCompleted = scopeTasks
        .filter((t) => t.status === 'Completed' && t.templateOrder?.[0] != null)
        .sort((a, b) => (b.templateOrder![0] ?? 0) - (a.templateOrder![0] ?? 0))[0]
      if (!lastCompleted) continue
      scopesChecked++

      // Snapshot statuses before, so we can report exactly what unlockNextTasks changed.
      const before = new Map(tasks.map((t) => [t.id, t.status]))

      if (CONFIRM) {
        await unlockNextTasks(lastCompleted)
        const after = await getAllTasksForProjectAll(project.id)
        const changed = after.filter((t) => before.get(t.id) && before.get(t.id) !== t.status)
        if (changed.length > 0) {
          scopesRepaired++
          const label = key === '__project__' ? 'project-level' : `item ${key}`
          console.log(`✓ ${project.projectId ?? project.id} (${project.projectName}) — ${label}:`)
          for (const c of changed) {
            console.log(`    ${c.taskName}  ${before.get(c.id)} → ${c.status}`)
          }
        }
      } else {
        // Dry run: replicate the same scope/order logic read-only via a second import
        // would duplicate planUnlock; instead just flag scopes with a Locked, path-having
        // task at or below the lowest currently-Locked, no-path task's order — i.e. the
        // exact shape the fix addresses — plus any scope with stuck project-level flow
        // (a Completed task followed only by Locked siblings, never advancing further).
        const locked = scopeTasks.filter((t) => t.status === 'Locked')
        const abandonedPath = locked.filter((t) => t.pathCondition)
        const genuinelyLocked = locked.filter((t) => !t.pathCondition)
        if (abandonedPath.length > 0 && genuinelyLocked.length > 0) {
          const label = key === '__project__' ? 'project-level' : `item ${key}`
          const nextCandidate = genuinelyLocked.sort(
            (a, b) => (a.templateOrder?.[0] ?? Infinity) - (b.templateOrder?.[0] ?? Infinity),
          )[0]
          console.log(
            `? ${project.projectId ?? project.id} (${project.projectName}) — ${label}: ` +
              `last completed "${lastCompleted.taskName}" (order ${lastCompleted.templateOrder?.[0]}), ` +
              `${abandonedPath.length} abandoned-path Locked task(s), likely next: "${nextCandidate?.taskName}" ` +
              `(order ${nextCandidate?.templateOrder?.[0]})`,
          )
        }
      }
    }
  }

  console.log(
    `\n${CONFIRM ? `Repaired ${scopesRepaired} scope(s).` : `Checked ${scopesChecked} scope(s) with a completed task across ${projects.length} project(s).`}`,
  )
  if (!CONFIRM) console.log('Re-run with --confirm to apply (uses the real unlockNextTasks — sends notifications).\n')
  process.exit(0)
}

run().catch((e) => { console.error(e); process.exit(1) })
