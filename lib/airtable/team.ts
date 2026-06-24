// Team domain — team members and workers

import { WorkerOption, WorkerCreateInput, WorkerUpdateInput } from '../types'
import { createNotification, ROLE_DASHBOARD } from '../notifications'
import {
  TEAM_MEMBERS,
  WORKERS,
  PROJECTS,
  fetchAll,
  fetchWithRetry,
  airtableHeaders,
  recUrl,
  tblUrl,
  BASE_URL,
  RawRecord,
  str,
  num,
  bool,
  selectName,
} from './_client'
import { updateProject } from './projects'

// Maps internal SQL role names to Airtable System Role singleSelect values
const AIRTABLE_ROLE_MAP: Record<string, string> = {
  superadmin: 'Superadmin',
  manager: 'Manager',
  sed: 'SED',
  fabrication: 'Fabrication',
  installation: 'Installation',
}

export interface TeamMember {
  id: string
  name: string
  role: string
  active: boolean
}

export interface TeamMemberSync {
  id: string           // Airtable record ID
  name: string
  email: string
  systemRole: string
  active: boolean
}

export async function createTeamMember(data: {
  name: string
  email: string
  role: string
}): Promise<string> {
  const res = await fetchWithRetry(tblUrl(TEAM_MEMBERS.TABLE_ID), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({
      fields: {
        [TEAM_MEMBERS.NAME]: data.name,
        [TEAM_MEMBERS.AIRTABLE_EMAIL]: data.email,
        [TEAM_MEMBERS.SYSTEM_ROLE]: AIRTABLE_ROLE_MAP[data.role] ?? data.role,
        [TEAM_MEMBERS.ACTIVE]: true,
      },
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return record.id
}

export async function getActiveTeamMembersForSync(): Promise<TeamMemberSync[]> {
  const records = await fetchAll(TEAM_MEMBERS.TABLE_ID, {
    filterByFormula: `{${TEAM_MEMBERS.ACTIVE}} = 1`,
  })
  return records.map((r) => ({
    id: r.id,
    name: str(r.fields[TEAM_MEMBERS.NAME]) ?? '',
    email: str(r.fields[TEAM_MEMBERS.AIRTABLE_EMAIL]) ?? '',
    systemRole: str(r.fields[TEAM_MEMBERS.SYSTEM_ROLE]) ?? '',
    active: bool(r.fields[TEAM_MEMBERS.ACTIVE]) ?? true,
  }))
}

export async function getInstallationTeamMembers(): Promise<TeamMember[]> {
  const formula = `AND({${TEAM_MEMBERS.SYSTEM_ROLE}}="Installation", {${TEAM_MEMBERS.ACTIVE}}=1)`
  const records = await fetchAll(TEAM_MEMBERS.TABLE_ID, {
    filterByFormula: formula,
    fields: [TEAM_MEMBERS.NAME, TEAM_MEMBERS.SYSTEM_ROLE, TEAM_MEMBERS.ACTIVE],
  })
  return records.map((r) => ({
    id: r.id,
    name: str(r.fields[TEAM_MEMBERS.NAME]) ?? '',
    role: str(r.fields[TEAM_MEMBERS.SYSTEM_ROLE]) ?? '',
    active: bool(r.fields[TEAM_MEMBERS.ACTIVE]) ?? true,
  }))
}

export async function assignInstallationTeam(
  projectId: string,
  teamMemberIds: string[],
  opts?: { itemName?: string; itemId?: string },
): Promise<import('../types').Project> {
  const project = await updateProject(projectId, {
    [PROJECTS.INSTALLATION_TEAM_MEMBERS]: teamMemberIds,
  })
  const projectRef = project.nickname ?? project.projectName ?? project.projectId
  const body = opts?.itemName ? `${projectRef} — ${opts.itemName}` : projectRef
  await createNotification({
    recipientRole: 'installation',
    title: 'Installation team assigned',
    body,
    link: ROLE_DASHBOARD['installation'],
  })
  return project
}

export async function updateTeamMember(
  recordId: string,
  data: { name?: string; email?: string; role?: string; active?: boolean },
): Promise<void> {
  const fields: Record<string, unknown> = {}
  if (data.name !== undefined) fields[TEAM_MEMBERS.NAME] = data.name
  if (data.email !== undefined) fields[TEAM_MEMBERS.AIRTABLE_EMAIL] = data.email
  if (data.role !== undefined) fields[TEAM_MEMBERS.SYSTEM_ROLE] = AIRTABLE_ROLE_MAP[data.role] ?? data.role
  if (data.active !== undefined) fields[TEAM_MEMBERS.ACTIVE] = data.active

  if (Object.keys(fields).length === 0) return

  const res = await fetchWithRetry(recUrl(TEAM_MEMBERS.TABLE_ID, recordId), {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
}

export async function deleteTeamMember(recordId: string): Promise<void> {
  const res = await fetchWithRetry(`${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/${TEAM_MEMBERS.TABLE_ID}/${recordId}`, {
    method: 'DELETE',
    headers: airtableHeaders(),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
}

// ─── Workers ─────────────────────────────────────────────────────────────────

function transformWorker(rec: RawRecord): WorkerOption {
  const f = rec.fields
  return {
    id: rec.id,
    name: str(f[WORKERS.NAME]) ?? rec.id,
    fullName: str(f[WORKERS.FULL_NAME]),
    nickname: str(f[WORKERS.NICKNAME]),
    role: selectName(f[WORKERS.ROLE]),
    workerType: selectName(f[WORKERS.WORKER_TYPE]) as WorkerOption['workerType'],
    active: bool(f[WORKERS.ACTIVE]) ?? false,
    hourlyRate: num(f[WORKERS.HOURLY_RATE]) ?? undefined,
  }
}

export async function getAllWorkers(): Promise<WorkerOption[]> {
  const records = await fetchAll(WORKERS.TABLE, {
    sort: [{ field: WORKERS.NAME, direction: 'asc' }],
    fields: [WORKERS.NAME, WORKERS.FULL_NAME, WORKERS.NICKNAME, WORKERS.ROLE, WORKERS.WORKER_TYPE, WORKERS.ACTIVE, WORKERS.HOURLY_RATE],
  })
  return records.map(transformWorker)
}

export async function getTimesheetWorkers(): Promise<WorkerOption[]> {
  const records = await fetchAll(WORKERS.TABLE, {
    filterByFormula: `{${WORKERS.ACTIVE}}=TRUE()`,
    sort: [{ field: WORKERS.NAME, direction: 'asc' }],
    fields: [WORKERS.NAME, WORKERS.FULL_NAME, WORKERS.NICKNAME, WORKERS.ROLE, WORKERS.WORKER_TYPE, WORKERS.ACTIVE, WORKERS.HOURLY_RATE],
  })
  return records.map((rec) => {
    const f = rec.fields
    return {
      id: rec.id,
      name: str(f[WORKERS.NAME]) ?? rec.id,
      fullName: str(f[WORKERS.FULL_NAME]),
      nickname: str(f[WORKERS.NICKNAME]),
      role: selectName(f[WORKERS.ROLE]),
      workerType: selectName(f[WORKERS.WORKER_TYPE]) as WorkerOption['workerType'],
      hourlyRate: num(f[WORKERS.HOURLY_RATE]) ?? undefined,
    }
  })
}

export async function createWorker(input: WorkerCreateInput): Promise<WorkerOption> {
  const fields: Record<string, unknown> = {
    [WORKERS.NAME]: input.name,
  }
  if (input.fullName) fields[WORKERS.FULL_NAME] = input.fullName
  if (input.nickname) fields[WORKERS.NICKNAME] = input.nickname
  if (input.role) fields[WORKERS.ROLE] = input.role
  if (input.workerType) fields[WORKERS.WORKER_TYPE] = input.workerType
  if (input.active !== undefined) fields[WORKERS.ACTIVE] = input.active
  if (input.hourlyRate !== undefined) fields[WORKERS.HOURLY_RATE] = input.hourlyRate
  const res = await fetchWithRetry(tblUrl(WORKERS.TABLE), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformWorker(record)
}

export async function updateWorker(id: string, input: WorkerUpdateInput): Promise<WorkerOption> {
  const fields: Record<string, unknown> = {}
  if (input.name !== undefined) fields[WORKERS.NAME] = input.name
  if (input.fullName !== undefined) fields[WORKERS.FULL_NAME] = input.fullName
  if (input.nickname !== undefined) fields[WORKERS.NICKNAME] = input.nickname
  if (input.role !== undefined) fields[WORKERS.ROLE] = input.role
  if (input.workerType !== undefined) fields[WORKERS.WORKER_TYPE] = input.workerType || null
  if (input.active !== undefined) fields[WORKERS.ACTIVE] = input.active
  if (input.hourlyRate !== undefined) fields[WORKERS.HOURLY_RATE] = input.hourlyRate
  const res = await fetchWithRetry(recUrl(WORKERS.TABLE, id), {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformWorker(record)
}

export async function deleteWorker(id: string): Promise<void> {
  const res = await fetchWithRetry(recUrl(WORKERS.TABLE, id), {
    method: 'DELETE',
    headers: airtableHeaders(),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
}
