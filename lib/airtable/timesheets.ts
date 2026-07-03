// Timesheets domain

import { TimesheetEntry, CreateTimesheetBatchInput, CreateTimesheetStatusInput, UpdateTimesheetInput, TimesheetFilters, WeeklySummary } from '../types'
import {
  PRODUCTION_TIMESHEETS,
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
  selectName,
} from './_client'
import { getAllWorkers } from './team'

function transformTimesheetEntry(rec: RawRecord): TimesheetEntry {
  const f = rec.fields
  const supervisorIds = strArr(f[PRODUCTION_TIMESHEETS.SUPERVISOR])
  const locRaw = selectName(f[PRODUCTION_TIMESHEETS.LOCATION_TYPE])
  const locationType: TimesheetEntry['locationType'] =
    locRaw === 'Factory' ? 'Factory' : locRaw === 'Project' ? 'Project' : undefined
  const statusRaw = selectName(f[PRODUCTION_TIMESHEETS.DAY_STATUS])
  const status: TimesheetEntry['status'] =
    statusRaw === 'Holiday' ? 'Holiday' : statusRaw === 'Absent' ? 'Absent' : 'Working'
  return {
    id: rec.id,
    entryLabel: str(f[PRODUCTION_TIMESHEETS.ENTRY_LABEL]),
    workDate: str(f[PRODUCTION_TIMESHEETS.WORK_DATE]) ?? '',
    supervisorId: supervisorIds[0],
    workerIds: strArr(f[PRODUCTION_TIMESHEETS.WORKER]),
    projectIds: strArr(f[PRODUCTION_TIMESHEETS.PROJECT]),
    locationType,
    status,
    regularHours: num(f[PRODUCTION_TIMESHEETS.REGULAR_HOURS]) ?? 0,
    overtimeHours: num(f[PRODUCTION_TIMESHEETS.OVERTIME_HOURS]) ?? 0,
    totalHours: num(f[PRODUCTION_TIMESHEETS.TOTAL_HOURS]) ?? 0,
    notes: str(f[PRODUCTION_TIMESHEETS.NOTES]),
  }
}

export async function getTimesheetEntries(filters: TimesheetFilters = {}): Promise<TimesheetEntry[]> {
  const conditions: string[] = []
  if (filters.from) conditions.push(`DATESTR({${PRODUCTION_TIMESHEETS.WORK_DATE}}) >= "${filters.from}"`)
  if (filters.to) conditions.push(`DATESTR({${PRODUCTION_TIMESHEETS.WORK_DATE}}) <= "${filters.to}"`)
  if (filters.workerId) conditions.push(`FIND("${filters.workerId}", ARRAYJOIN({${PRODUCTION_TIMESHEETS.WORKER}}, ","))`)
  if (filters.projectId) conditions.push(`FIND("${filters.projectId}", ARRAYJOIN({${PRODUCTION_TIMESHEETS.PROJECT}}, ","))`)
  const filterByFormula = conditions.length > 0
    ? conditions.length === 1 ? conditions[0] : `AND(${conditions.join(', ')})`
    : undefined
  const records = await fetchAll(PRODUCTION_TIMESHEETS.TABLE, {
    filterByFormula,
    sort: [{ field: PRODUCTION_TIMESHEETS.WORK_DATE, direction: 'desc' }],
  })
  const entries = records.map(transformTimesheetEntry)

  if (entries.length === 0) return entries

  // Enrich with worker/supervisor names and estimated cost
  const allWorkers = await getAllWorkers()
  const workerMap = new Map(allWorkers.map((w) => [w.id, w]))
  const workerDisplayName = (w: (typeof allWorkers)[0]) =>
    w.nickname ? `${w.name} (${w.nickname})` : w.name
  for (const entry of entries) {
    // Supervisor
    if (entry.supervisorId) {
      const sup = workerMap.get(entry.supervisorId)
      if (sup) entry.supervisorName = workerDisplayName(sup)
    }
    // Workers
    const names = entry.workerIds
      .map((id) => workerMap.get(id))
      .filter(Boolean)
      .map((w) => workerDisplayName(w!))
    entry.workerNames = names
    entry.workerName = names[0] ?? entry.supervisorName
    // Estimated cost — a row with exactly one worker (the current, per-worker shape)
    // is costed on that worker's own rate only. Legacy rows that still have several
    // workers grouped into one entry fall back to summing supervisor + all workers,
    // matching how those rows were originally costed.
    if (entry.workerIds.length === 1) {
      const w = workerMap.get(entry.workerIds[0])
      if (w?.hourlyRate) entry.estimatedCost = w.hourlyRate * entry.totalHours
    } else {
      const people = [
        entry.supervisorId ? workerMap.get(entry.supervisorId) : undefined,
        ...entry.workerIds.map((id) => workerMap.get(id)),
      ].filter(Boolean)
      const totalRate = people.reduce((s, w) => s + (w!.hourlyRate ?? 0), 0)
      if (totalRate > 0) entry.estimatedCost = totalRate * entry.totalHours
    }
  }

  // Enrich with project refs
  const projectIdSet = new Set(entries.flatMap((e) => e.projectIds))
  if (projectIdSet.size > 0) {
    const formula = projectIdSet.size === 1
      ? `RECORD_ID()="${[...projectIdSet][0]}"`
      : `OR(${[...projectIdSet].map((id) => `RECORD_ID()="${id}"`).join(',')})`
    const projectRecords = await fetchAll(PROJECTS.TABLE_ID, {
      filterByFormula: formula,
      fields: [PROJECTS.PROJECT_ID, PROJECTS.PROJECT_NAME, PROJECTS.QUOTATION_NUMBER],
    })
    const projectRefMap = new Map(
      projectRecords.map((r) => {
        const f = r.fields
        const ref = str(f[PROJECTS.QUOTATION_NUMBER]) || str(f[PROJECTS.PROJECT_ID]) || r.id
        const name = str(f[PROJECTS.PROJECT_NAME]) ?? ''
        return [r.id, name ? `${ref} — ${name}` : ref]
      }),
    )
    for (const entry of entries) {
      const pId = entry.projectIds[0]
      if (pId) entry.projectRef = projectRefMap.get(pId) ?? entry.projectRef
    }
  }

  return entries
}

// Given a date, returns every worker who already has a row that day, with a
// human label describing what they're on — used both to grey them out in the
// picker and as a server-side guard against double-booking.
export async function getWorkerAssignmentsForDate(
  workDate: string,
): Promise<Map<string, { label: string; entryId: string }>> {
  const entries = await getTimesheetEntries({ from: workDate, to: workDate })
  const map = new Map<string, { label: string; entryId: string }>()
  for (const entry of entries) {
    const label =
      entry.status === 'Holiday' ? 'Holiday' :
      entry.status === 'Absent' ? 'Absent' :
      entry.locationType === 'Factory' ? 'Factory' :
      entry.projectRef ?? entry.projectIds[0] ?? 'Assigned'
    for (const workerId of entry.workerIds) {
      map.set(workerId, { label, entryId: entry.id })
    }
  }
  return map
}

export async function createTimesheetEntries(input: CreateTimesheetBatchInput): Promise<TimesheetEntry[]> {
  const recordFields = input.workers.map((w) => {
    const fields: Record<string, unknown> = {
      [PRODUCTION_TIMESHEETS.WORK_DATE]: input.workDate,
      [PRODUCTION_TIMESHEETS.SUPERVISOR]: [input.supervisorId],
      [PRODUCTION_TIMESHEETS.WORKER]: [w.workerId],
      [PRODUCTION_TIMESHEETS.LOCATION_TYPE]: input.locationType,
      [PRODUCTION_TIMESHEETS.REGULAR_HOURS]: w.regularHours,
      [PRODUCTION_TIMESHEETS.OVERTIME_HOURS]: w.overtimeHours ?? 0,
      [PRODUCTION_TIMESHEETS.DAY_STATUS]: 'Working',
    }
    if (input.projectIds.length > 0) fields[PRODUCTION_TIMESHEETS.PROJECT] = input.projectIds
    if (input.notes) fields[PRODUCTION_TIMESHEETS.NOTES] = input.notes
    return fields
  })

  const created: RawRecord[] = []
  for (let i = 0; i < recordFields.length; i += 10) {
    const chunk = recordFields.slice(i, i + 10)
    const res = await fetchWithRetry(tblUrl(PRODUCTION_TIMESHEETS.TABLE), {
      method: 'POST',
      headers: airtableHeaders(),
      body: JSON.stringify({ records: chunk.map((fields) => ({ fields })) }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Airtable error ${res.status}: ${body}`)
    }
    const data = (await res.json()) as { records: RawRecord[] }
    created.push(...data.records)
  }
  return created.map(transformTimesheetEntry)
}

export async function createTimesheetStatusEntry(input: CreateTimesheetStatusInput): Promise<TimesheetEntry> {
  const fields: Record<string, unknown> = {
    [PRODUCTION_TIMESHEETS.WORK_DATE]: input.workDate,
    [PRODUCTION_TIMESHEETS.WORKER]: [input.workerId],
    [PRODUCTION_TIMESHEETS.DAY_STATUS]: input.status,
    [PRODUCTION_TIMESHEETS.REGULAR_HOURS]: 0,
    [PRODUCTION_TIMESHEETS.OVERTIME_HOURS]: 0,
  }
  if (input.notes) fields[PRODUCTION_TIMESHEETS.NOTES] = input.notes
  const res = await fetchWithRetry(tblUrl(PRODUCTION_TIMESHEETS.TABLE), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformTimesheetEntry(record)
}

export async function updateTimesheetEntry(
  id: string,
  input: UpdateTimesheetInput,
): Promise<TimesheetEntry> {
  const fields: Record<string, unknown> = {}
  if (input.regularHours !== undefined) fields[PRODUCTION_TIMESHEETS.REGULAR_HOURS] = input.regularHours
  if (input.overtimeHours !== undefined) fields[PRODUCTION_TIMESHEETS.OVERTIME_HOURS] = input.overtimeHours
  if (input.notes !== undefined) fields[PRODUCTION_TIMESHEETS.NOTES] = input.notes
  const res = await fetchWithRetry(recUrl(PRODUCTION_TIMESHEETS.TABLE, id), {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformTimesheetEntry(record)
}

export async function getTimesheetEntryById(id: string): Promise<TimesheetEntry> {
  const res = await fetchWithRetry(recUrl(PRODUCTION_TIMESHEETS.TABLE, id), {
    headers: airtableHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformTimesheetEntry(record)
}

export async function deleteTimesheetEntry(id: string): Promise<void> {
  const res = await fetchWithRetry(recUrl(PRODUCTION_TIMESHEETS.TABLE, id), {
    method: 'DELETE',
    headers: airtableHeaders(),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
}

export async function getTimesheetWeeklySummary(weekStart: string): Promise<WeeklySummary> {
  const start = new Date(weekStart)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const weekEnd = end.toISOString().slice(0, 10)
  const entries = await getTimesheetEntries({ from: weekStart, to: weekEnd })
  const workerMap = new Map<string, {
    workerName: string
    days: Map<string, { status: TimesheetEntry['status']; regularHours: number; overtimeHours: number; totalHours: number; projectRef?: string; entryId: string }>
  }>()
  for (const entry of entries) {
    // Each row is one worker's day — group by the worker themselves, not the
    // supervisor, so every worker gets their own hours tracked (previously this
    // grouped by supervisorId, which meant workers never got their own summary row).
    const wId = entry.workerIds[0] ?? entry.supervisorId ?? 'unknown'
    const displayName = entry.workerName ?? entry.supervisorName ?? wId
    if (!workerMap.has(wId)) {
      workerMap.set(wId, { workerName: displayName, days: new Map() })
    }
    const worker = workerMap.get(wId)!
    worker.days.set(entry.workDate, {
      status: entry.status,
      regularHours: entry.regularHours,
      overtimeHours: entry.overtimeHours,
      totalHours: entry.totalHours,
      projectRef: entry.projectRef,
      entryId: entry.id,
    })
  }
  const workers = Array.from(workerMap.entries()).map(([workerId, data]) => {
    const days = Array.from(data.days.entries())
      .map(([date, d]) => ({ date, ...d }))
      .sort((a, b) => a.date.localeCompare(b.date))
    const totalRegular = days.reduce((s, d) => s + d.regularHours, 0)
    const totalOvertime = days.reduce((s, d) => s + d.overtimeHours, 0)
    const totalHours = days.reduce((s, d) => s + d.totalHours, 0)
    return { workerId, workerName: data.workerName, days, totalRegular, totalOvertime, totalHours }
  })
  return { weekStart, weekEnd, workers }
}
