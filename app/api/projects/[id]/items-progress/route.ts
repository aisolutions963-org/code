import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAllTasksForProjectAll, getProjectById, getProjectItemNameMap } from '@/lib/airtable'
import { Task } from '@/lib/types'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [tasks, project] = await Promise.all([
    getAllTasksForProjectAll(params.id),
    getProjectById(params.id),
  ])

  // Enrich tasks with item names
  const itemIds = Array.from(new Set(tasks.flatMap((t) => t.projectItem ?? [])))
  const nameMap = await getProjectItemNameMap(itemIds)
  const enriched: Task[] = tasks.map((t) => {
    const itemId = t.projectItem?.[0]
    if (itemId && nameMap[itemId]) return { ...t, projectItemName: nameMap[itemId] }
    return t
  })

  // Filter to per-item tasks only
  const itemTasks = enriched.filter((t) => t.projectItem && t.projectItem.length > 0)

  // Group by item ID
  const groups = new Map<string, { name: string; tasks: Task[] }>()
  for (const t of itemTasks) {
    const itemId = t.projectItem![0]
    if (!groups.has(itemId)) groups.set(itemId, { name: t.projectItemName ?? itemId, tasks: [] })
    groups.get(itemId)!.tasks.push(t)
  }

  const items = Array.from(groups.entries()).map(([id, { name, tasks: grp }]) => {
    const activeTasks = grp.filter((t) => t.status === 'To Do' || t.status === 'In Progress')
    const completedCount = grp.filter((t) => t.status === 'Completed').length
    const totalCount = grp.length
    const isComplete = totalCount > 0 && grp.every((t) => t.status === 'Completed')
    const allTasks = grp
    return { id, name, activeTasks, allTasks, completedCount, totalCount, isComplete }
  })

  return NextResponse.json({
    projectId: params.id,
    projectName: project.projectName,
    projectRef: project.projectId,
    projectNickname: project.nickname,
    projectStage: project.projectStage,
    items,
  })
}
