import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getTaskById, updateTask, createCalendarEvent, createTasksBatch } from '@/lib/airtable'
import { TASKS } from '@/lib/fieldMap'
import { createNotification } from '@/lib/notifications'
import { z } from 'zod'

// Preparing-phase standalone task (Installation, order 5)
const TEMPLATE_PREPARING = 'recf4HCyQtXyCUAWJ'
// Open-phase per-item task (Installation, order 25)
const TEMPLATE_PER_ITEM = 'recJwTTBRwS6TYgDk'

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
    const projectId = task.projectRecordId
    const isPerItem = (task.projectItem?.length ?? 0) > 0
    const templateId = isPerItem ? TEMPLATE_PER_ITEM : TEMPLATE_PREPARING

    const projectLabel = task.projectNickname
      ? task.projectName ? `${task.projectNickname} — ${task.projectName}` : task.projectNickname
      : (task.projectName ?? task.projectRef ?? '')
    const eventTitle = projectLabel ? `Take Measurements — ${projectLabel}` : 'Take Measurements'

    const newTask: Record<string, unknown> = {
      [TASKS.TASK_NAME]: isPerItem ? 'Take measurements for item' : 'Take Measurement',
      [TASKS.PROJECT]: projectId,
      [TASKS.STATUS]: 'To Do',
      [TASKS.TASK_START_DATE]: date,
      [TASKS.TASK_TEMPLATES_LINK]: [templateId],
    }
    if (isPerItem && task.projectItem?.length) {
      newTask[TASKS.PROJECT_ITEM] = task.projectItem
    }

    // Create the Installation task first — if this fails, no calendar event is orphaned.
    await createTasksBatch([newTask])

    await Promise.all([
      createCalendarEvent({
        title: eventTitle,
        date,
        projectId,
        eventType: 'installation',
        createdBy: session.name,
      }),
      createNotification({
        recipientRole: 'installation',
        title: `Measurement scheduled — ${projectLabel || 'project'}`,
        body: `Date: ${date} · Assigned to: ${teamMemberName} · By: ${session.name}`,
        link: '/dashboard/fix',
      }),
    ])

    // Mark the gateway chip completed — SED's job is done once they've assigned the team.
    await updateTask(params.id, { taskStartDate: date, status: 'Completed' })

    return NextResponse.json({ ok: true })
  },
)
