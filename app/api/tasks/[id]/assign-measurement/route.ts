import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getTaskById, updateTask, createCalendarEvent, createTasksBatch, getTaskTemplates, getProjectById, getProjectItemNameMap } from '@/lib/airtable'
import { TASKS } from '@/lib/fieldMap'
import { createNotification } from '@/lib/notifications'
import { z } from 'zod'

const Schema = z.object({
  teamMemberName: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
})

export const POST = requireRole('manager', 'sed', 'superadmin')(
  async (req: NextRequest, session, { params }) => {
    let body: unknown
    try { body = await req.json() } catch { body = {} }
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const { teamMemberName, date } = parsed.data

    const task = await getTaskById(params.id)
    const projectId = task.projectRecordId ?? task.project?.[0]
    const isPerItem = (task.projectItem?.length ?? 0) > 0

    // Look up the correct template by order + department to avoid stale hard-coded IDs.
    // Order 5  = standalone "Take Measurement"       (Installation, Preparing phase)
    // Order 25 = per-item "Take measurements for item" (Installation, Open phase)
    const targetOrder = isPerItem ? 25 : 5
    const targetStage = isPerItem ? 'Open' : 'Preparing'
    const templates = await getTaskTemplates(targetStage)
    const template = templates.find(
      (t) => t.templateOrder === targetOrder && t.department.includes('Installation'),
    )
    if (!projectId) {
      return NextResponse.json({ error: 'Task is not linked to a project' }, { status: 400 })
    }
    if (!template) {
      return NextResponse.json(
        { error: `Template not found (order ${targetOrder}, Installation, ${targetStage})` },
        { status: 500 },
      )
    }

    // getTaskById returns an UNENRICHED task (no projectNickname/projectName/projectRef — those are
    // only added in the getTasksByRole feed path), so resolve the label from the project directly.
    // Include the item name for per-item measurements so the calendar event identifies exactly what
    // is being measured: "Take Measurements — <ref> · <project> › <item>".
    const project = await getProjectById(projectId).catch(() => null)
    const ref = project?.projectId ?? task.projectRef ?? ''
    const label = project?.nickname ?? project?.projectName ?? ''
    let itemName = ''
    const measuredItemId = task.projectItem?.[0]
    if (measuredItemId) {
      const nameMap = await getProjectItemNameMap([measuredItemId]).catch(() => ({} as Record<string, string>))
      itemName = nameMap[measuredItemId] ?? ''
    }
    const labelParts = [ref, label].filter(Boolean).join(' · ')
    const eventTitle = `Take Measurements${labelParts ? ` — ${labelParts}` : ''}${itemName ? ` › ${itemName}` : ''}`
    const projectLabel = label || ref // used by the Arabic scheduling notification below

    const newTask: Record<string, unknown> = {
      [TASKS.TASK_NAME]: isPerItem ? 'Take measurements for item' : 'Take Measurement',
      [TASKS.PROJECT]: projectId,
      [TASKS.STATUS]: 'To Do',
      [TASKS.TASK_START_DATE]: date,
      [TASKS.TASK_TEMPLATES_LINK]: [template.id],
    }
    // Carry the template's path condition so the spawned task is never path-less: a path-less
    // Take-Measurement at a low order would otherwise block the order-chain AND-join (see
    // isTaskDone/isMeasurementSideTask in lib/orderChain.ts).
    if (template.pathCondition) {
      newTask[TASKS.PATH_CONDITION] = template.pathCondition
    }
    if (isPerItem && task.projectItem?.length) {
      newTask[TASKS.PROJECT_ITEM] = task.projectItem
    }

    // Create the Installation task first — if this fails, no calendar event is orphaned.
    const [newTaskId] = await createTasksBatch([newTask])

    await Promise.all([
      createCalendarEvent({
        title: eventTitle,
        date,
        projectId,
        eventType: 'installation',
        createdBy: session.name,
        taskId: newTaskId, // dedup against the new Take-Measurement task's derived event
      }),
      createNotification({
        recipientRole: 'installation',
        title: `تم جدولة القياس — ${projectLabel || 'مشروع'}`,
        body: `التاريخ: ${date} · المكلَّف: ${teamMemberName} · بواسطة: ${session.name}`,
        link: '/dashboard/fix',
      }),
    ])

    // Mark the gateway chip completed — SED's job is done once they've assigned the team.
    await updateTask(params.id, { taskStartDate: date, status: 'Completed' })

    return NextResponse.json({ ok: true })
  },
)
