import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getTaskCountForProject, generateTasksForProject, generatePhase3TasksForItem, getProjectItemsForProject, getProjectById, updateProject } from '@/lib/airtable'
import { getUserByAirtableMemberId, addSedProjectMapping } from '@/lib/db'
import { PROJECTS } from '@/lib/fieldMap'

export const POST = requireRole('superadmin')(async (req, _session, { params }) => {
  const { id } = params

  let body: { stage?: string; force?: boolean } = {}
  try {
    body = await req.json()
  } catch {
    // empty body is fine
  }

  const { stage, force = false } = body
  if (!stage) {
    return NextResponse.json({ error: 'stage is required' }, { status: 400 })
  }

  // Special: generate Phase 3 tasks for all items of this project
  if (stage === 'phase3') {
    const items = await getProjectItemsForProject(id)
    if (items.length === 0) {
      return NextResponse.json({ success: true, created: 0, message: 'No items found for this project' })
    }
    let totalCreated = 0
    for (const item of items) {
      const { created } = await generatePhase3TasksForItem(id, item.id)
      totalCreated += created
    }
    // Advance project to Production stage
    const project = await getProjectById(id)
    const preProductionStages = ['Preparing', 'Open', 'Not-Approved']
    if (preProductionStages.includes(project.projectStage)) {
      await updateProject(id, { [PROJECTS.PROJECT_STAGE]: 'Production' })
    }
    return NextResponse.json({ success: true, created: totalCreated, items: items.length })
  }

  if (!force) {
    const existingCount = await getTaskCountForProject(id)
    if (existingCount > 0) {
      return NextResponse.json(
        {
          error: 'Tasks already exist for this project',
          existingCount,
          hint: 'Pass force: true to generate anyway',
        },
        { status: 409 },
      )
    }
  }

  const [result, project] = await Promise.all([
    generateTasksForProject(id, stage),
    getProjectById(id),
  ])

  // Sync SQLite SED mappings so the assigned SED can always see this project
  if (project.salesOwner?.id) {
    const owner = await getUserByAirtableMemberId(project.salesOwner.id)
    if (owner) await addSedProjectMapping(id, owner.id)
  }
  for (const communMemberId of project.communSedIds ?? []) {
    const u = await getUserByAirtableMemberId(communMemberId)
    if (u) await addSedProjectMapping(id, u.id)
  }

  return NextResponse.json({ success: true, ...result })
})
