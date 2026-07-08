// Calendar domain — calendar events

import {
  TASKS,
  PAYMENTS,
  CALENDAR_EVENTS,
  INSTALLATION_LOGS,
  PROJECTS,
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
}

export type CalendarEventType = CalendarEvent['type']

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  const [tasks, fabTasks, payments, customEvents, installationLogs, allProjects] = await Promise.all([
    fetchAll(TASKS.TABLE_ID, {
      filterByFormula: `AND(NOT({${TASKS.TASK_START_DATE}}=BLANK()), OR({${TASKS.STATUS}}="In Progress", {${TASKS.STATUS}}="To Do"))`,
      fields: [TASKS.TASK_NAME, TASKS.TASK_START_DATE, TASKS.COMPLETION_DATE, TASKS.DEPARTMENT, TASKS.PROJECT_ID, TASKS.PROJECT],
      sort: [{ field: TASKS.TASK_START_DATE, direction: 'asc' }],
    }),
    fetchAll(TASKS.TABLE_ID, {
      filterByFormula: `OR(NOT({${TASKS.PLANNED_PROD_START_DATE}}=BLANK()), NOT({${TASKS.EXPECTED_FAB_END_DATE}}=BLANK()))`,
      fields: [TASKS.TASK_NAME, TASKS.PLANNED_PROD_START_DATE, TASKS.EXPECTED_FAB_END_DATE, TASKS.PROJECT_ID, TASKS.PROJECT_ITEM, TASKS.PROJECT],
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
      fields: [PROJECTS.PROJECT_NAME, PROJECTS.PROJECT_ID, PROJECTS.NICKNAME],
    }),
  ])

  const projectNameMap = new Map<string, string>()
  const projectRefMap = new Map<string, string>()
  for (const p of allProjects) {
    const label = str(p.fields[PROJECTS.NICKNAME]) ?? str(p.fields[PROJECTS.PROJECT_NAME]) ?? str(p.fields[PROJECTS.PROJECT_ID])
    if (label) projectNameMap.set(p.id, label)
    const ref = str(p.fields[PROJECTS.PROJECT_ID])
    if (ref) projectRefMap.set(p.id, ref)
  }

  const getProjectName = (val: unknown): string | undefined => {
    const pid = str(val)
    return pid ? projectNameMap.get(pid) : undefined
  }

  const getProjectRef = (val: unknown): string | undefined => {
    const pid = str(val)
    return pid ? projectRefMap.get(pid) : undefined
  }

  // Build dedup set from manually created calendar events (title + date) so task-based
  // events don't show alongside a richer manually created event for the same thing.
  const calEventDedup = new Set<string>()
  for (const r of customEvents) {
    const t = str(r.fields[CALENDAR_EVENTS.TITLE])
    const d = str(r.fields[CALENDAR_EVENTS.DATE])
    if (t && d) calEventDedup.add(`${d}|${t}`)
  }

  const events: CalendarEvent[] = []

  for (const r of tasks) {
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
      title,
      date,
      type,
      projectId: str(f[TASKS.PROJECT_ID]),
      projectName: projectLabel,
      projectRef: getProjectRef(f[TASKS.PROJECT]),
      createdAt: r.createdTime,
    })
  }

  const allItemIds = new Set<string>()
  for (const r of fabTasks) {
    const ids = r.fields[TASKS.PROJECT_ITEM] as string[] | undefined
    if (ids?.[0]) allItemIds.add(ids[0])
  }
  const itemNameMap = allItemIds.size > 0 ? await getProjectItemNameMap(Array.from(allItemIds)) : {}

  for (const r of fabTasks) {
    const f = r.fields
    const projectId = str(f[TASKS.PROJECT_ID])
    const startDate = str(f[TASKS.PLANNED_PROD_START_DATE])
    const endDate = str(f[TASKS.EXPECTED_FAB_END_DATE])
    const label = str(f[TASKS.TASK_NAME]) ?? 'Production'
    const d = startDate || endDate
    if (d) {
      const itemIds = f[TASKS.PROJECT_ITEM] as string[] | undefined
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
        createdAt: r.createdTime,
      })
    }
  }

  for (const r of payments) {
    const f = r.fields
    const name = str(f[PAYMENTS.NAME]) ?? str(f[PAYMENTS.PAYMENT_TYPE]) ?? 'Payment'
    const amount = num(f[PAYMENTS.AMOUNT])
    const receivedDate = str(f[PAYMENTS.RECEIVED_DATE])
    const dueDate = str(f[PAYMENTS.DUE_DATE])
    const projectName = getProjectName(f[PAYMENTS.PROJECT])
    const projectRef = getProjectRef(f[PAYMENTS.PROJECT])
    const createdBy = str(f[PAYMENTS.RECORDED_BY])
    if (receivedDate) {
      events.push({ id: `${r.id}-rcv`, title: name, date: receivedDate, type: 'payment-received', amount, projectName, projectRef, createdBy, createdAt: r.createdTime })
    }
    if (dueDate && dueDate !== receivedDate) {
      events.push({ id: `${r.id}-due`, title: name, date: dueDate, type: 'payment-due', amount, projectName, projectRef, createdBy, createdAt: r.createdTime })
    }
  }

  for (const r of customEvents) {
    const f = r.fields
    const date = str(f[CALENDAR_EVENTS.DATE])
    const title = str(f[CALENDAR_EVENTS.TITLE])
    if (!date || !title) continue
    const customTask = str(f[CALENDAR_EVENTS.CUSTOM_TASK])
    const typePart = customTask?.split('|')[0]
    let evType: CalendarEvent['type'] = 'activity'
    if (typePart?.startsWith('f2:')) evType = 'delivery'
    else if (typePart?.startsWith('type:installation')) evType = 'installation'
    else if (typePart?.startsWith('type:fabrication'))  evType = 'fabrication'
    else if (typePart?.startsWith('type:delivery'))     evType = 'delivery'
    else if (typePart?.startsWith('type:personal'))     evType = 'personal'
    const teamPart = customTask?.split('|').find((p) => p.startsWith('team:'))
    const teamMemberIds = teamPart ? teamPart.slice(5).split(',').filter(Boolean) : undefined
    events.push({
      id: r.id,
      title,
      date,
      type: evType,
      notes: str(f[CALENDAR_EVENTS.NOTES]),
      customTask,
      createdBy: str(f[CALENDAR_EVENTS.CREATED_BY]),
      projectName: getProjectName(f[CALENDAR_EVENTS.PROJECT]),
      projectRef: getProjectRef(f[CALENDAR_EVENTS.PROJECT]),
      createdAt: r.createdTime,
      teamMemberIds,
    })
  }

  for (const r of installationLogs) {
    const f = r.fields
    const date = str(f[INSTALLATION_LOGS.DATE])
    if (!date) continue
    const desc = str(f[INSTALLATION_LOGS.WORK_DESCRIPTION])
    const name = str(f[INSTALLATION_LOGS.NAME])
    events.push({
      id: `instlog-${r.id}`,
      title: desc || name || 'Installation Day',
      date,
      type: 'installation',
      notes: desc,
      createdBy: str(f[INSTALLATION_LOGS.RECORDED_BY]),
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
}): Promise<void> {
  const fields: Record<string, unknown> = {
    [CALENDAR_EVENTS.TITLE]: input.title,
    [CALENDAR_EVENTS.DATE]: input.date,
  }
  if (input.notes) fields[CALENDAR_EVENTS.NOTES] = input.notes
  if (input.projectId) fields[CALENDAR_EVENTS.PROJECT] = [input.projectId]
  if (input.createdBy) fields[CALENDAR_EVENTS.CREATED_BY] = input.createdBy
  const baseKey = input.customTask
    ?? (input.eventType && input.eventType !== 'activity' ? `type:${input.eventType}` : undefined)
  const teamSuffix = input.teamMemberIds?.length ? `|team:${input.teamMemberIds.join(',')}` : ''
  const taskKey = baseKey ? `${baseKey}${teamSuffix}` : undefined
  if (taskKey) fields[CALENDAR_EVENTS.CUSTOM_TASK] = taskKey
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
