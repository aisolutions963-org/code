import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getAllTasksForProjectAll, getProjectById, getProjectItemNameMap } from '@/lib/airtable'
import { Task } from '@/lib/types'
import { isSedAuthorizedForProject } from '@/lib/sedAccess'

export const GET = requireRole()(async (_req, session, { params }) => {
  const { id } = params

  if (session.role === 'sed' && !(await isSedAuthorizedForProject(session, id))) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Project may have been deleted since the client last saw it — return 404 instead of
  // letting the Airtable 403/not-found bubble up as an unhandled 500 (logged as a fail).
  let project
  try {
    project = await getProjectById(id)
  } catch {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  const tasks = await getAllTasksForProjectAll(id, session.role)

  const itemIds = Array.from(new Set(tasks.flatMap((t) => t.projectItem ?? [])))
  const nameMap = await getProjectItemNameMap(itemIds)
  // getAllTasksForProjectAll skips enrichTasksWithProjectRef (it's the workflow-engine
  // fetch), so tasks arrive without the project's quotation context. Every task here
  // belongs to this one project, so attach it from the already-fetched `project` — the
  // F4 payment panel needs projectQuotationNumber/Reference to record a payment.
  const enriched: Task[] = tasks.map((t) => {
    const itemId = t.projectItem?.[0]
    return {
      ...t,
      projectRecordId: t.projectRecordId ?? id,
      projectQuotationNumber: t.projectQuotationNumber ?? project.quotationNumber,
      projectQuotationReference: t.projectQuotationReference ?? project.quotationReference,
      projectRequestType: t.projectRequestType ?? project.requestType,
      projectTradeReference: t.projectTradeReference ?? project.tradeReference,
      ...(itemId && nameMap[itemId] ? { projectItemName: nameMap[itemId] } : {}),
    }
  })

  const itemTasks = enriched.filter((t) => t.projectItem && t.projectItem.length > 0)

  const groups = new Map<string, { name: string; tasks: Task[] }>()
  for (const t of itemTasks) {
    const itemId = t.projectItem![0]
    if (!groups.has(itemId)) groups.set(itemId, { name: t.projectItemName ?? itemId, tasks: [] })
    groups.get(itemId)!.tasks.push(t)
  }

  const items = Array.from(groups.entries()).map(([itemId, { name, tasks: grp }]) => {
    const activeTasks = grp.filter((t) => t.status === 'To Do' || t.status === 'In Progress')
    const completedCount = grp.filter((t) => t.status === 'Completed').length
    const totalCount = grp.length
    const isComplete = totalCount > 0 && grp.every((t) => t.status === 'Completed')
    return { id: itemId, name, activeTasks, allTasks: grp, completedCount, totalCount, isComplete }
  })

  return NextResponse.json({
    projectId: id,
    projectName: project.projectName,
    projectRef: project.projectId,
    projectNickname: project.nickname,
    projectStage: project.projectStage,
    items,
  })
})
