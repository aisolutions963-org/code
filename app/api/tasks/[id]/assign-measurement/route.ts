import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getTaskById, updateTask, createCalendarEvent, createTasksBatch } from '@/lib/airtable'
import { TASKS } from '@/lib/fieldMap'
import { createNotification } from '@/lib/notifications'
import { z } from 'zod'

const TAKE_MEASUREMENT_TEMPLATE_ID = 'recf4HCyQtXyCUAWJ'

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
    const projectLabel = task.projectNickname
      ? task.projectName ? `${task.projectNickname} — ${task.projectName}` : task.projectNickname
      : (task.projectName ?? task.projectRef ?? '')
    const eventTitle = projectLabel ? `Take Measurements — ${projectLabel}` : 'Take Measurements'

    await Promise.all([
      createCalendarEvent({
        title: eventTitle,
        date,
        projectId,
        eventType: 'installation',
        createdBy: session.name,
      }),
      createTasksBatch([{
        [TASKS.TASK_NAME]: 'Take Measurement',
        [TASKS.PROJECT]: projectId,
        [TASKS.STATUS]: 'To Do',
        [TASKS.DEPARTMENT]: ['Installation'],
        [TASKS.TASK_START_DATE]: date,
        [TASKS.TASK_TEMPLATES_LINK]: [TAKE_MEASUREMENT_TEMPLATE_ID],
      }]),
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
