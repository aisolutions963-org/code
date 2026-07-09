import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAllLockedTasksForProject } from '@/lib/airtable'
import { Task } from '@/lib/types'

export const dynamic = 'force-dynamic'

const isGateway = (name: string) => /\[gateway\]/i.test(name)
const isGate = (name: string) => /\[gate\]/i.test(name) && !/\[gateway\]/i.test(name)

// The single next locked step in a scope, or null when the next thing is a choice
// (a gateway / multiple path chips / an approval gate) — nothing to preview then.
function nextSingleStep(locked: Task[]): string | null {
  const candidates = locked.filter(
    (t) => t.templateOrder?.[0] != null && t.taskName !== 'Follow Up',
  )
  if (candidates.length === 0) return null
  const minOrder = Math.min(...candidates.map((t) => t.templateOrder![0]))
  const atMin = candidates.filter((t) => t.templateOrder![0] === minOrder)
  if (atMin.length !== 1) return null
  const t = atMin[0]
  if (isGateway(t.taskName) || isGate(t.taskName) || (t.pathCondition != null && t.pathCondition !== '')) {
    return null
  }
  return t.taskName
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  try {
    const locked = await getAllLockedTasksForProject(id)

    const projectLevel = locked.filter((t) => !t.projectItem?.length)

    const byItem = new Map<string, Task[]>()
    for (const t of locked) {
      const itemId = t.projectItem?.[0]
      if (!itemId) continue
      if (!byItem.has(itemId)) byItem.set(itemId, [])
      byItem.get(itemId)!.push(t)
    }
    const items: Record<string, string | null> = {}
    for (const [itemId, tasks] of byItem) items[itemId] = nextSingleStep(tasks)

    return NextResponse.json({ project: nextSingleStep(projectLevel), items })
  } catch (error) {
    console.error('GET /api/projects/[id]/next-steps error:', error)
    return NextResponse.json({ error: 'Failed to compute next steps' }, { status: 500 })
  }
}
