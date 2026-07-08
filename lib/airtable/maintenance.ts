// Maintenance / warranty domain

import { MaintenanceRecord } from '../types'
import {
  MAINTENANCE,
  PROJECTS,
  fetchAll,
  fetchWithRetry,
  airtableHeaders,
  recUrl,
  tblUrl,
  RawRecord,
  transformMaintenance,
  deleteByProject,
} from './_client'
import { updateProject } from './projects'

export async function getMaintenanceRecords(): Promise<MaintenanceRecord[]> {
  const records = await fetchAll(MAINTENANCE.TABLE_ID, {
    sort: [{ field: MAINTENANCE.START_DATE, direction: 'desc' }],
  })
  return records.map(transformMaintenance)
}

export async function createMaintenanceRecord(
  projectId: string,
  dates: { startDate: string; endDate: string; status?: string },
): Promise<string> {
  const fields: Record<string, unknown> = {
    [MAINTENANCE.PROJECTS]: [projectId],
    [MAINTENANCE.STATUS]: dates.status ?? 'Active',
    [MAINTENANCE.START_DATE]: dates.startDate,
    [MAINTENANCE.END_DATE]: dates.endDate,
    [MAINTENANCE.WARRANTY_TYPE]: 'Standard 1-Year',
  }
  const res = await fetchWithRetry(tblUrl(MAINTENANCE.TABLE_ID), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ records: [{ fields }] }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const data = await res.json() as { records: RawRecord[] }
  if (!data.records[0]) throw new Error('Airtable returned empty records for maintenance record creation')
  return data.records[0].id
}

export async function getMaintenanceRecordForProject(projectId: string): Promise<MaintenanceRecord | null> {
  const records = await fetchAll(MAINTENANCE.TABLE_ID, {
    filterByFormula: `FIND("${projectId}", ARRAYJOIN({${MAINTENANCE.PROJECTS}}))`,
    maxRecords: 1,
  })
  return records.length > 0 ? transformMaintenance(records[0]) : null
}

export async function activateMaintenanceRecord(recordId: string): Promise<void> {
  const res = await fetchWithRetry(recUrl(MAINTENANCE.TABLE_ID, recordId), {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields: { [MAINTENANCE.STATUS]: 'Active' } }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
}

/**
 * Auto-expire any Active maintenance record whose warranty end date (start + 1yr)
 * has passed, and flip its linked project(s) to the "Warranty expired" stage.
 * Idempotent — safe to call from both the daily cron and the warranty page load.
 * Returns the number of records expired.
 */
export async function expireOverdueMaintenanceRecords(): Promise<number> {
  const records = await getMaintenanceRecords()
  const now = Date.now()
  const toExpire = records.filter(
    (r) => r.status === 'Active' && r.endDate && new Date(r.endDate).getTime() < now,
  )
  if (toExpire.length === 0) return 0
  await Promise.all(
    toExpire.flatMap((r) => [
      expireMaintenanceRecord(r.id),
      ...(r.projects ?? []).map((pid) =>
        updateProject(pid, { [PROJECTS.PROJECT_STAGE]: 'Warranty expired' }),
      ),
    ]),
  )
  return toExpire.length
}

export async function expireMaintenanceRecord(recordId: string): Promise<void> {
  const res = await fetchWithRetry(recUrl(MAINTENANCE.TABLE_ID, recordId), {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields: { [MAINTENANCE.STATUS]: 'Expired' } }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
}

export async function deleteMaintenanceByProject(projectId: string): Promise<number> {
  return deleteByProject(MAINTENANCE.TABLE_ID, MAINTENANCE.PROJECTS, projectId)
}
