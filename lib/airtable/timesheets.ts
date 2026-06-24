// Timesheets domain

import { TimesheetEntry, CreateTimesheetInput, UpdateTimesheetInput, TimesheetFilters, WeeklySummary } from '../types'
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
  return {
    id: rec.id,
    entryLabel: str(f[PRODUCTION_TIMESHEETS.ENTRY_LABEL]),
    workDate: str(f[PRODUCTION_TIMESHEETS.WORK_DATE]) ?? '',
    supervisorId: supervisorIds[0],
    workerIds: strArr(f[PRODUCTION_TIMESHEETS.WORKER]),
    projectIds: strArr(f[PRODUCTION_TIMESHEETS.PROJECT]),
    locationType,
    regularHours: num(f[PRODUCTION_TIMESHEETS.REGULAR_HOURS]) ?? 0,
    overtimeHours: num(f[PRODUCTION_TIMESHEETS.OVERTIME_HOURS]) ?? 0,
    totalHours: num(f[PRODUCTION_TIMESHEETS.TOTAL_HOURS]) ?? 0,
    notes: str(f[PRODUCTION_TIMESHEETS.NOTES]),
  }
}

export async function getTimesheetEntries(filters: TimesheetFilters = {}): Promise<TimesheetEntry[]> {
  const conditions: string[] = []
  if (filters.from) conditions.push(`{${PRODUCTION_TIMESHEETS.WORK_DATE}} >= "${filters.from}"`)
  if (filters.to) conditions.push(`{${PRODUCTION_TIMESHEETS.WORK_DATE}} <= "${filters.to}"`)
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
    entry.workerName = entry.supervisorName ?? names[0]
    // Estimated cost
    const people = [
      entry.supervisorId ? workerMap.get(entry.supervisorId) : undefined,
      ...entry.workerIds.map((id) => workerMap.get(id)),
    ].filter(Boolean)
    const totalRate = people.reduce((s, w) => s + (w!.hourlyRate ?? 0), 0)
    if (totalRate > 0) entry.estimatedCost = totalRate * entry.totalHours
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

export async function checkTimesheetDuplicate(
  supervisorId: string,
  workDate: string,
): Promise<boolean> {
  const formula = `AND({${PRODUCTION_TIMESHEETS.WORK_DATE}}="${workDate}", FIND("${supervisorId}", ARRAYJOIN({${PRODUCTION_TIMESHEETS.SUPERVISOR}}, ",")))`
  const records = await fetchAll(PRODUCTION_TIMESHEETS.TABLE, {
    filterByFormula: formula,
    fields: [PRODUCTION_TIMESHEETS.ENTRY_LABEL],
    maxRecords: 1,
  })
  return records.length > 0
}

export async function createTimesheetEntry(input: CreateTimesheetInput): Promise<TimesheetEntry> {
  const regular = input.regularHours
  const overtime = input.overtimeHours ?? 0
  const fields: Record<string, unknown> = {
    [PRODUCTION_TIMESHEETS.WORK_DATE]: input.workDate,
    [PRODUCTION_TIMESHEETS.SUPERVISOR]: [input.supervisorId],
    [PRODUCTION_TIMESHEETS.WORKER]: input.workerIds,
    [PRODUCTION_TIMESHEETS.LOCATION_TYPE]: input.locationType,
    [PRODUCTION_TIMESHEETS.REGULAR_HOURS]: regular,
    [PRODUCTION_TIMESHEETS.OVERTIME_HOURS]: overtime,
  }
  if (input.projectIds.length > 0) fields[PRODUCTION_TIMESHEETS.PROJECT] = input.projectIds
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
    days: Map<string, { regularHours: number; overtimeHours: number; totalHours: number; projectRef?: string; entryId: string }>
  }>()
  for (const entry of entries) {
    const wId = entry.supervisorId ?? entry.workerIds[0] ?? 'unknown'
    const displayName = entry.supervisorName ?? entry.workerName ?? wId
    if (!workerMap.has(wId)) {
      workerMap.set(wId, { workerName: displayName, days: new Map() })
    }
    const worker = workerMap.get(wId)!
    worker.days.set(entry.workDate, {
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
