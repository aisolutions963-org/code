import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAllTasksForProjectAll } from '@/lib/airtable'
import { ROLE_TO_DEPARTMENT } from '@/lib/permissions'
import { isAutoTask } from '@/lib/phases'
import { Task, Role, NextStepHint } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Strip workflow prefixes so the preview reads like a normal step name.
function cleanName(name: string): string {
  return name
    .replace(/^\[gateway\]\s*/i, '')
    .replace(/^\[gate\]\s*/i, '')
    .replace(/^\d+\s*[—-]\s*/, '')
    .trim()
}

// Mirror the task-feed visibility (buildDepartmentFormula in lib/airtable/tasks): a non-superadmin
// only sees tasks whose department intersects their role's departments AND that don't carry the
// Superadmin department. This is what decides whether the viewer can act on a step now.
function canSee(role: Role, depts: string[]): boolean {
  if (role === 'superadmin') return true
  if (depts.length === 0 || depts.includes('Superadmin')) return false
  const allowed = ROLE_TO_DEPARTMENT[role] ?? []
  return depts.some((d) => allowed.includes(d))
}

// The next locked step in a scope, as a short label. Previews the single lowest-order
// locked task (cleaned); when several tie at that order — e.g. a gateway's path chips or
// multiple items — it's a choice, so show a generic prompt. Only null when nothing is locked.
//
// Path handling: only the entry step of each gateway path is ever promoted out of Locked
// at generation (see lib/orderChain.ts isTaskDone), so a Locked+pathCondition task on a
// path nobody chose stays Locked forever and must not be previewed. But a path that WAS
// chosen (has ≥1 Completed / In Progress task in this scope) can have a legitimately
// pending Locked next step — those remain valid candidates.
function nextLockedLabel(scopeTasks: Task[], activePaths: Set<string>): string | null {
  const candidates = scopeTasks.filter(
    (t) =>
      t.status === 'Locked' &&
      t.templateOrder?.[0] != null &&
      t.taskName !== 'Follow Up' &&
      (!t.pathCondition || activePaths.has(t.pathCondition)),
  )
  if (candidates.length === 0) return null
  const minOrder = Math.min(...candidates.map((t) => t.templateOrder![0]))
  const atMin = candidates.filter((t) => t.templateOrder![0] === minOrder)
  if (atMin.length === 1) {
    return cleanName(atMin[0].taskName) || 'Choose the next action'
  }
  return 'Choose the next action'
}

// Per-scope hint. When the scope's genuine current step (its active head) belongs to a
// department the viewer can't act on, surface "Waiting on <dept>: <step>" instead of the
// next locked step (which would be misleading — it's blocked behind the hidden step).
function nextStepHint(scopeTasks: Task[], role: Role): NextStepHint | null {
  const activePaths = new Set(
    scopeTasks
      .filter((t) => t.pathCondition && (t.status === 'Completed' || t.status === 'In Progress'))
      .map((t) => t.pathCondition!),
  )

  // The active head: the lowest-order task actually in play now — excluding gate/gateway
  // markers, the Follow Up loop, auto/System tasks (they self-complete), and unchosen
  // gateway chips (a path nobody picked).
  const activeHead = scopeTasks
    .filter(
      (t) =>
        (t.status === 'To Do' || t.status === 'In Progress') &&
        t.templateOrder?.[0] != null &&
        !/^\[gate/i.test(t.taskName) &&
        t.taskName !== 'Follow Up' &&
        !isAutoTask(t.taskName) &&
        (!t.pathCondition || activePaths.has(t.pathCondition)),
    )
    .sort((a, b) => a.templateOrder![0] - b.templateOrder![0])[0]

  if (activeHead) {
    const depts = (activeHead.department ?? []).filter((d) => d !== 'System')
    if (depts.length > 0 && !canSee(role, depts)) {
      return {
        label: cleanName(activeHead.taskName) || 'the next action',
        waiting: true,
        by: depts.join(' / '),
      }
    }
  }

  const locked = nextLockedLabel(scopeTasks, activePaths)
  return locked ? { label: locked } : null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = session.role as Role

  const { id } = await params
  try {
    const all = await getAllTasksForProjectAll(id)

    const projectLevel = all.filter((t) => !t.projectItem?.length)

    const byItem = new Map<string, Task[]>()
    for (const t of all) {
      const itemId = t.projectItem?.[0]
      if (!itemId) continue
      if (!byItem.has(itemId)) byItem.set(itemId, [])
      byItem.get(itemId)!.push(t)
    }
    const items: Record<string, NextStepHint | null> = {}
    for (const [itemId, tasks] of byItem) items[itemId] = nextStepHint(tasks, role)

    return NextResponse.json({ project: nextStepHint(projectLevel, role), items })
  } catch (error) {
    console.error('GET /api/projects/[id]/next-steps error:', error)
    return NextResponse.json({ error: 'Failed to compute next steps' }, { status: 500 })
  }
}
