// Calendar domain — calendar events

import {
  TASKS,
  PAYMENTS,
  CALENDAR_EVENTS,
  INSTALLATION_LOGS,
  PROJECTS,
  TEAM_MEMBERS,
  fetchAll,
  fetchWithRetry,
  airtableHeaders,
  recUrl,
  tblUrl,
  RawRecord,
  str,
  num,
  strArr,
  deleteByProject,
} from './_client'
import { getProjectItemNameMap } from './tasks'
import { projectRefLabel } from '../projectRef'

export interface CalendarEvent {
  id: string
  title: string
  date: string
  endDate?: string
  type: 'installation' | 'delivery' | 'activity' | 'payment-due' | 'payment-received' | 'fabrication' | 'personal'
  projectId?: string
  projectName?: string
  projectRef?: string
  itemName?: string
  amount?: number
  notes?: string
  customTask?: string
  createdBy?: string
  createdAt?: string
  teamMemberIds?: string[]
  /** Person responsible (assignee for tasks, recorder for logs/payments/custom events) */
  responsible?: string
  /** Department(s) / team the event belongs to */
  department?: string[]
}

export type CalendarEventType = CalendarEvent['type']

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  const [tasks, fabTasks, payments, customEvents, installationLogs, allProjects] = await Promise.all([
    fetchAll(TASKS.TABLE_ID, {
      filterByFormula: `AND(NOT({${TASKS.TASK_START_DATE}}=BLANK()), OR({${TASKS.STATUS}}="In Progress", {${TASKS.STATUS}}="To Do"))`,
      fields: [TASKS.TASK_NAME, TASKS.TASK_START_DATE, TASKS.COMPLETION_DATE, TASKS.DEPARTMENT, TASKS.ASSIGNED_TO, TASKS.PROJECT_ID, TASKS.PROJECT],
      sort: [{ field: TASKS.TASK_START_DATE, direction: 'asc' }],
    }),
    fetchAll(TASKS.TABLE_ID, {
      filterByFormula: `OR(NOT({${TASKS.PLANNED_PROD_START_DATE}}=BLANK()), NOT({${TASKS.EXPECTED_FAB_END_DATE}}=BLANK()))`,
      fields: [TASKS.TASK_NAME, TASKS.PLANNED_PROD_START_DATE, TASKS.EXPECTED_FAB_END_DATE, TASKS.DEPARTMENT, TASKS.ASSIGNED_TO, TASKS.PROJECT_ID, TASKS.PROJECT_ITEM, TASKS.PROJECT],
      sort: [{ field: TASKS.PLANNED_PROD_START_DATE, direction: 'asc' }],
    }),
    fetchAll(PAYMENTS.TABLE_ID, {
      filterByFormula: `OR(NOT({${PAYMENTS.DUE_DATE}}=BLANK()), NOT({${PAYMENTS.RECEIVED_DATE}}=BLANK()))`,
      fields: [PAYMENTS.NAME, PAYMENTS.AMOUNT, PAYMENTS.PAYMENT_TYPE, PAYMENTS.DUE_DATE, PAYMENTS.RECEIVED_DATE, PAYMENTS.PROJECT, PAYMENTS.RECORDED_BY],
    }),
    fetchAll(CALENDAR_EVENTS.TABLE_ID, {
      fields: [CALENDAR_EVENTS.TITLE, CALENDAR_EVENTS.DATE, CALENDAR_EVENTS.NOTES, CALENDAR_EVENTS.PROJECT, CALENDAR_EVENTS.CREATED_BY, CALENDAR_EVENTS.CUSTOM_TASK],
      sort: [{ field: CALENDAR_EVENTS.DATE, direction: 'asc' }],
    }),
    fetchAll(INSTALLATION_LOGS.TABLE_ID, {
      filterByFormula: `NOT({${INSTALLATION_LOGS.DATE}}=BLANK())`,
      fields: [INSTALLATION_LOGS.NAME, INSTALLATION_LOGS.DATE, INSTALLATION_LOGS.WORK_DESCRIPTION, INSTALLATION_LOGS.PROJECT, INSTALLATION_LOGS.RECORDED_BY],
      sort: [{ field: INSTALLATION_LOGS.DATE, direction: 'asc' }],
    }),
    fetchAll(PROJECTS.TABLE_ID, {
      fields: [PROJECTS.PROJECT_NAME, PROJECTS.PROJECT_ID, PROJECTS.NICKNAME, PROJECTS.DELETED_AT, PROJECTS.QUOTATION_NUMBER, PROJECTS.QUOTATION_REFERENCE],
    }),
  ])

  const projectNameMap = new Map<string, string>()
  const projectRefMap = new Map<string, string>()
  // Projects that currently exist AND are not soft-deleted. An event tied to any project
  // NOT in this set — soft-deleted (DELETED_AT set) or fully purged (record gone) — is
  // excluded, so deleting a project drops its calendar events from every source.
  const validProjectIds = new Set<string>()
  for (const p of allProjects) {
    const label = str(p.fields[PROJECTS.NICKNAME]) ?? str(p.fields[PROJECTS.PROJECT_NAME]) ?? str(p.fields[PROJECTS.PROJECT_ID])
    if (label) projectNameMap.set(p.id, label)
    const ref = projectRefLabel({
      quotationNumber: str(p.fields[PROJECTS.QUOTATION_NUMBER]),
      quotationReference: str(p.fields[PROJECTS.QUOTATION_REFERENCE]),
      projectId: str(p.fields[PROJECTS.PROJECT_ID]),
    })
    if (ref) projectRefMap.set(p.id, ref)
    if (!str(p.fields[PROJECTS.DELETED_AT])) validProjectIds.add(p.id)
  }

  // A source's project reference may be a text rec-id (TASKS.PROJECT) or a linked-record
  // array (CALENDAR_EVENTS/PAYMENTS/INSTALLATION_LOGS) — normalise to the rec id.
  const projectRecId = (val: unknown): string | undefined => {
    if (typeof val === 'string') return val || undefined
    if (Array.isArray(val)) return typeof val[0] === 'string' ? val[0] : undefined
    return undefined
  }
  // True when the event references a project that no longer exists or is soft-deleted.
  // Events with no project reference (personal notes, reminders) are kept.
  const isRemovedProject = (val: unknown): boolean => {
    const id = projectRecId(val)
    return !!id && !validProjectIds.has(id)
  }

  const getProjectName = (val: unknown): string | undefined => {
    const pid = projectRecId(val)
    return pid ? projectNameMap.get(pid) : undefined
  }

  const getProjectRef = (val: unknown): string | undefined => {
    const pid = projectRecId(val)
    return pid ? projectRefMap.get(pid) : undefined
  }

  // Resolve assignee (Team Member) names for task/fabrication events so each event
  // can show who is responsible.
  const assigneeIds = new Set<string>()
  for (const r of [...tasks, ...fabTasks]) {
    const ids = r.fields[TASKS.ASSIGNED_TO] as string[] | undefined
    if (ids?.[0]) assigneeIds.add(ids[0])
  }
  const memberNameMap = new Map<string, string>()
  if (assigneeIds.size > 0) {
    const ids = Array.from(assigneeIds)
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10))
    await Promise.all(
      chunks.map(async (chunk) => {
        const formula = `OR(${chunk.map((id) => `RECORD_ID()="${id}"`).join(',')})`
        const records = await fetchAll(TEAM_MEMBERS.TABLE_ID, {
          filterByFormula: formula,
          fields: [TEAM_MEMBERS.NAME],
        })
        for (const r of records) memberNameMap.set(r.id, str(r.fields[TEAM_MEMBERS.NAME]) ?? '')
      }),
    )
  }

  const getAssignee = (val: unknown): string | undefined => {
    const ids = val as string[] | undefined
    const id = ids?.[0]
    return id ? memberNameMap.get(id) || undefined : undefined
  }

  // Reliable, title-independent dedup: any task whose id is referenced by a custom event's
  // `task:{id}` / `f2:{id}` CUSTOM_TASK segment is represented by that custom event — its
  // task-derived twin is suppressed. (title-based calEventDedup kept as a harmless fallback.)
  const calEventDedup = new Set<string>()
  const linkedTaskIds = new Set<string>()
  for (const r of customEvents) {
    const t = str(r.fields[CALENDAR_EVENTS.TITLE])
    const d = str(r.fields[CALENDAR_EVENTS.DATE])
    if (t && d) calEventDedup.add(`${d}|${t}`)
    const ct = str(r.fields[CALENDAR_EVENTS.CUSTOM_TASK])
    if (ct) {
      for (const seg of ct.split('|')) {
        if (seg.startsWith('task:')) linkedTaskIds.add(seg.slice(5))
        else if (seg.startsWith('f2:')) linkedTaskIds.add(seg.slice(3))
      }
    }
  }

  // Collect the project item referenced by any task/fab event so each item-related event
  // can be labelled with its item name (not just the project). Also map linked task → item
  // so custom events created from a per-item task can surface that item too.
  const allItemIds = new Set<string>()
  const taskItemId = new Map<string, string>()
  for (const r of [...tasks, ...fabTasks]) {
    const ids = r.fields[TASKS.PROJECT_ITEM] as string[] | undefined
    if (ids?.[0]) {
      allItemIds.add(ids[0])
      taskItemId.set(r.id, ids[0])
    }
  }
  const itemNameMap = allItemIds.size > 0 ? await getProjectItemNameMap(Array.from(allItemIds)) : {}
  const itemNameFor = (val: unknown): string | undefined => {
    const ids = val as string[] | undefined
    return ids?.[0] ? itemNameMap[ids[0]] : undefined
  }

  const events: CalendarEvent[] = []

  for (const r of tasks) {
    if (linkedTaskIds.has(r.id)) continue // superseded by its custom calendar event
    if (isRemovedProject(r.fields[TASKS.PROJECT])) continue
    const f = r.fields
    const date = str(f[TASKS.TASK_START_DATE]) ?? str(f[TASKS.COMPLETION_DATE])
    const dept = strArr(f[TASKS.DEPARTMENT])
    if (!date) continue
    const taskName = str(f[TASKS.TASK_NAME]) ?? 'Task'
    const projectLabel = getProjectName(f[TASKS.PROJECT])
    const title = projectLabel ? `${taskName} — ${projectLabel}` : taskName
    if (calEventDedup.has(`${date}|${title}`)) continue
    const type: CalendarEvent['type'] = dept.includes('Installation') ? 'installation' : 'activity'
    events.push({
      id: r.id,
      title: taskName,
      date,
      type,
      projectId: str(f[TASKS.PROJECT_ID]),
      projectName: projectLabel,
      projectRef: getProjectRef(f[TASKS.PROJECT]),
      itemName: itemNameFor(f[TASKS.PROJECT_ITEM]),
      responsible: getAssignee(f[TASKS.ASSIGNED_TO]),
      department: dept.length > 0 ? dept : undefined,
      createdAt: r.createdTime,
    })
  }

  for (const r of fabTasks) {
    if (linkedTaskIds.has(r.id)) continue // superseded by its custom calendar event
    if (isRemovedProject(r.fields[TASKS.PROJECT])) continue
    const f = r.fields
    const projectId = str(f[TASKS.PROJECT_ID])
    const startDate = str(f[TASKS.PLANNED_PROD_START_DATE])
    const endDate = str(f[TASKS.EXPECTED_FAB_END_DATE])
    const label = str(f[TASKS.TASK_NAME]) ?? 'Production'
    const d = startDate || endDate
    if (d) {
      const itemIds = f[TASKS.PROJECT_ITEM] as string[] | undefined
      const fabDept = strArr(f[TASKS.DEPARTMENT])
      events.push({
        id: `${r.id}-fab`,
        title: label,
        date: d,
        endDate: endDate || d,
        type: 'fabrication',
        projectId,
        projectName: getProjectName(f[TASKS.PROJECT]),
        projectRef: getProjectRef(f[TASKS.PROJECT]),
        itemName: itemIds?.[0] ? itemNameMap[itemIds[0]] : undefined,
        responsible: getAssignee(f[TASKS.ASSIGNED_TO]),
        department: fabDept.length > 0 ? fabDept : ['Fabrication'],
        createdAt: r.createdTime,
      })
    }
  }

  for (const r of payments) {
    const f = r.fields
    if (isRemovedProject(f[PAYMENTS.PROJECT])) continue
    const name = str(f[PAYMENTS.NAME]) ?? str(f[PAYMENTS.PAYMENT_TYPE]) ?? 'Payment'
    const amount = num(f[PAYMENTS.AMOUNT])
    const receivedDate = str(f[PAYMENTS.RECEIVED_DATE])
    const dueDate = str(f[PAYMENTS.DUE_DATE])
    const projectName = getProjectName(f[PAYMENTS.PROJECT])
    const projectRef = getProjectRef(f[PAYMENTS.PROJECT])
    const createdBy = str(f[PAYMENTS.RECORDED_BY])
    if (receivedDate) {
      events.push({ id: `${r.id}-rcv`, title: name, date: receivedDate, type: 'payment-received', amount, projectName, projectRef, createdBy, responsible: createdBy, department: ['Finance'], createdAt: r.createdTime })
    }
    if (dueDate && dueDate !== receivedDate) {
      events.push({ id: `${r.id}-due`, title: name, date: dueDate, type: 'payment-due', amount, projectName, projectRef, createdBy, responsible: createdBy, department: ['Finance'], createdAt: r.createdTime })
    }
  }

  for (const r of customEvents) {
    const f = r.fields
    const date = str(f[CALENDAR_EVENTS.DATE])
    const title = str(f[CALENDAR_EVENTS.TITLE])
    if (!date || !title) continue
    if (isRemovedProject(f[CALENDAR_EVENTS.PROJECT])) continue
    const customTask = str(f[CALENDAR_EVENTS.CUSTOM_TASK])
    const segs = customTask?.split('|') ?? []
    const typeSeg = segs.find((p) => p.startsWith('type:'))
    let evType: CalendarEvent['type'] = 'activity'
    if (segs.some((p) => p.startsWith('f2:'))) evType = 'delivery'
    else if (typeSeg === 'type:installation') evType = 'installation'
    else if (typeSeg === 'type:fabrication')  evType = 'fabrication'
    else if (typeSeg === 'type:delivery')     evType = 'delivery'
    else if (typeSeg === 'type:personal')     evType = 'personal'
    const teamPart = segs.find((p) => p.startsWith('team:'))
    const teamMemberIds = teamPart ? teamPart.slice(5).split(',').filter(Boolean) : undefined
    // If this custom event was created from a per-item task (task:/f2: segment), show that item.
    let custItemName: string | undefined
    for (const seg of segs) {
      const tid = seg.startsWith('task:') ? seg.slice(5) : seg.startsWith('f2:') ? seg.slice(3) : undefined
      if (tid && taskItemId.has(tid)) { custItemName = itemNameMap[taskItemId.get(tid)!]; break }
    }
    events.push({
      id: r.id,
      title,
      date,
      type: evType,
      notes: str(f[CALENDAR_EVENTS.NOTES]),
      customTask,
      createdBy: str(f[CALENDAR_EVENTS.CREATED_BY]),
      responsible: str(f[CALENDAR_EVENTS.CREATED_BY]),
      projectName: getProjectName(f[CALENDAR_EVENTS.PROJECT]),
      projectRef: getProjectRef(f[CALENDAR_EVENTS.PROJECT]),
      itemName: custItemName,
      createdAt: r.createdTime,
      teamMemberIds,
    })
  }

  for (const r of installationLogs) {
    const f = r.fields
    if (isRemovedProject(f[INSTALLATION_LOGS.PROJECT])) continue
    const date = str(f[INSTALLATION_LOGS.DATE])
    if (!date) continue
    const desc = str(f[INSTALLATION_LOGS.WORK_DESCRIPTION])
    const name = str(f[INSTALLATION_LOGS.NAME])
    const recordedByTeam = str(f[INSTALLATION_LOGS.RECORDED_BY])
    events.push({
      id: `instlog-${r.id}`,
      title: desc || name || 'Installation Day',
      date,
      type: 'installation',
      notes: desc,
      createdBy: recordedByTeam,
      // Installation crews work as teams (one shared login per team), so the
      // recorder is the responsible team.
      responsible: recordedByTeam,
      department: ['Installation'],
      projectName: getProjectName(f[INSTALLATION_LOGS.PROJECT]),
      projectRef: getProjectRef(f[INSTALLATION_LOGS.PROJECT]),
      createdAt: r.createdTime,
    })
  }

  return events
}

export async function createCalendarEvent(input: {
  title: string
  date: string
  notes?: string
  projectId?: string
  createdBy?: string
  customTask?: string
  eventType?: string
  teamMemberIds?: string[]
  /** When set, the event is tagged `task:{taskId}` and upserted — so it dedups against the
   *  task-derived event (see getCalendarEvents) and re-saving a date moves the one event. */
  taskId?: string
}): Promise<void> {
  const fields: Record<string, unknown> = {
    [CALENDAR_EVENTS.TITLE]: input.title,
    [CALENDAR_EVENTS.DATE]: input.date,
  }
  if (input.notes) fields[CALENDAR_EVENTS.NOTES] = input.notes
  if (input.projectId) fields[CALENDAR_EVENTS.PROJECT] = [input.projectId]
  if (input.createdBy) fields[CALENDAR_EVENTS.CREATED_BY] = input.createdBy

  // Build the CUSTOM_TASK key as pipe-delimited segments. Task-scoped events lead with a
  // stable `task:{id}` segment (used for upsert + dedup); type/team ride along as segments.
  const segments: string[] = []
  if (input.taskId) {
    segments.push(`task:${input.taskId}`)
    if (input.eventType && input.eventType !== 'activity') segments.push(`type:${input.eventType}`)
  } else if (input.customTask) {
    segments.push(input.customTask)
  } else if (input.eventType && input.eventType !== 'activity') {
    segments.push(`type:${input.eventType}`)
  }
  if (input.teamMemberIds?.length) segments.push(`team:${input.teamMemberIds.join(',')}`)
  if (segments.length) fields[CALENDAR_EVENTS.CUSTOM_TASK] = segments.join('|')

  // Upsert on the task key so re-scheduling updates the single event instead of adding another.
  if (input.taskId) {
    const existing = await fetchAll(CALENDAR_EVENTS.TABLE_ID, {
      filterByFormula: `FIND("task:${input.taskId}", {${CALENDAR_EVENTS.CUSTOM_TASK}}) = 1`,
      fields: [CALENDAR_EVENTS.TITLE],
    })
    if (existing.length > 0) {
      const res = await fetchWithRetry(recUrl(CALENDAR_EVENTS.TABLE_ID, existing[0].id), {
        method: 'PATCH',
        headers: airtableHeaders(),
        body: JSON.stringify({ fields }),
      })
      if (!res.ok) throw new Error(`Airtable error ${res.status}: ${await res.text()}`)
      return
    }
  }

  const res = await fetchWithRetry(tblUrl(CALENDAR_EVENTS.TABLE_ID), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
}

export async function upsertF2DeliveryEvent(input: {
  taskId: string
  title: string
  date: string
  projectId?: string
  createdBy?: string
}): Promise<void> {
  const key = `f2:${input.taskId}`
  const existing = await fetchAll(CALENDAR_EVENTS.TABLE_ID, {
    filterByFormula: `{${CALENDAR_EVENTS.CUSTOM_TASK}}="${key}"`,
    fields: [CALENDAR_EVENTS.TITLE],
  })
  const fields: Record<string, unknown> = {
    [CALENDAR_EVENTS.TITLE]: input.title,
    [CALENDAR_EVENTS.DATE]: input.date,
    [CALENDAR_EVENTS.CUSTOM_TASK]: key,
  }
  if (input.projectId) fields[CALENDAR_EVENTS.PROJECT] = [input.projectId]
  if (input.createdBy) fields[CALENDAR_EVENTS.CREATED_BY] = input.createdBy

  if (existing.length > 0) {
    const res = await fetchWithRetry(recUrl(CALENDAR_EVENTS.TABLE_ID, existing[0].id), {
      method: 'PATCH',
      headers: airtableHeaders(),
      body: JSON.stringify({ fields }),
    })
    if (!res.ok) throw new Error(`Airtable error ${res.status}`)
  } else {
    const res = await fetchWithRetry(tblUrl(CALENDAR_EVENTS.TABLE_ID), {
      method: 'POST',
      headers: airtableHeaders(),
      body: JSON.stringify({ fields }),
    })
    if (!res.ok) throw new Error(`Airtable error ${res.status}`)
  }
}

export async function upsertReminderEvent(input: {
  customKey: string
  title: string
  date: string
  notes?: string
  createdBy?: string
}): Promise<void> {
  const existing = await fetchAll(CALENDAR_EVENTS.TABLE_ID, {
    filterByFormula: `{${CALENDAR_EVENTS.CUSTOM_TASK}}="${input.customKey}"`,
    fields: [CALENDAR_EVENTS.TITLE],
  })
  const fields: Record<string, unknown> = {
    [CALENDAR_EVENTS.TITLE]: input.title,
    [CALENDAR_EVENTS.DATE]: input.date,
    [CALENDAR_EVENTS.CUSTOM_TASK]: input.customKey,
  }
  if (input.notes) fields[CALENDAR_EVENTS.NOTES] = input.notes
  if (input.createdBy) fields[CALENDAR_EVENTS.CREATED_BY] = input.createdBy

  if (existing.length > 0) {
    const res = await fetchWithRetry(recUrl(CALENDAR_EVENTS.TABLE_ID, existing[0].id), {
      method: 'PATCH',
      headers: airtableHeaders(),
      body: JSON.stringify({ fields }),
    })
    if (!res.ok) throw new Error(`Airtable error ${res.status}`)
  } else {
    const res = await fetchWithRetry(tblUrl(CALENDAR_EVENTS.TABLE_ID), {
      method: 'POST',
      headers: airtableHeaders(),
      body: JSON.stringify({ fields }),
    })
    if (!res.ok) throw new Error(`Airtable error ${res.status}`)
  }
}

export async function deleteCalendarEventsByProject(projectId: string): Promise<number> {
  return deleteByProject(CALENDAR_EVENTS.TABLE_ID, CALENDAR_EVENTS.PROJECT, projectId)
}
