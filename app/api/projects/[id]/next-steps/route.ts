import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAllTasksForProjectAll } from '@/lib/airtable'
import { Task } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Strip workflow prefixes so the preview reads like a normal step name.
function cleanName(name: string): string {
  return name
    .replace(/^\[gateway\]\s*/i, '')
    .replace(/^\[gate\]\s*/i, '')
    .replace(/^\d+\s*[—-]\s*/, '')
    .trim()
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
function nextStepLabel(scopeTasks: Task[]): string | null {
  const activePaths = new Set(
    scopeTasks
      .filter((t) => t.pathCondition && (t.status === 'Completed' || t.status === 'In Progress'))
      .map((t) => t.pathCondition!),
  )
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
    const items: Record<string, string | null> = {}
    for (const [itemId, tasks] of byItem) items[itemId] = nextStepLabel(tasks)

    return NextResponse.json({ project: nextStepLabel(projectLevel), items })
  } catch (error) {
    console.error('GET /api/projects/[id]/next-steps error:', error)
    return NextResponse.json({ error: 'Failed to compute next steps' }, { status: 500 })
  }
}
