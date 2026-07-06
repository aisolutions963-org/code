// Projects domain — projects, clients, end users, handover sheets

function escAtStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

import { Client, Project, ProjectCreateInput, HandoverSheet } from '../types'
import {
  CLIENTS,
  PROJECTS,
  TASKS,
  PROJECT_ITEMS,
  END_USERS,
  HANDOVER_SHEETS,
  MAINTENANCE,
  PURCHASE_ORDERS,
  INSTALLATION_LOGS,
  PRODUCTION_TIMESHEETS,
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
  strArr,
  firstLinkedRecord,
  transformProject,
  deleteByProject,
} from './_client'
import { todayUAE } from '../dateUtils'

// ─── Clients ─────────────────────────────────────────────────────────────────

function transformClient(record: RawRecord): Client & { projectCount: number } {
  const f = record.fields
  const projects = f[CLIENTS.PROJECTS]
  const projectCount = Array.isArray(projects) ? projects.length : 0
  return {
    id: record.id,
    clientId: str(f[CLIENTS.CLIENT_ID]),
    clientName: str(f[CLIENTS.CLIENT_NAME]) ?? '',
    phone: str(f[CLIENTS.PHONE]),
    email: str(f[CLIENTS.EMAIL]),
    category: str(f[CLIENTS.CATEGORY]) as Client['category'],
    projectCount,
  }
}

export async function getAllClients(): Promise<(Client & { projectCount: number })[]> {
  const records = await fetchAll(CLIENTS.TABLE_ID, {
    fields: [CLIENTS.CLIENT_NAME, CLIENTS.PHONE, CLIENTS.EMAIL, CLIENTS.CLIENT_ID, CLIENTS.PROJECTS, CLIENTS.CATEGORY],
    sort: [{ field: CLIENTS.CLIENT_NAME, direction: 'asc' }],
  })
  return records.map(transformClient)
}

async function findClientByName(name: string): Promise<Client | null> {
  const safe = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const formula = `LOWER({${CLIENTS.CLIENT_NAME}}) = LOWER("${safe}")`
  const records = await fetchAll(CLIENTS.TABLE_ID, {
    filterByFormula: formula,
    fields: [CLIENTS.CLIENT_NAME, CLIENTS.PHONE, CLIENTS.EMAIL, CLIENTS.CLIENT_ID, CLIENTS.CATEGORY],
    maxRecords: 1,
  })
  if (records.length === 0) return null
  return transformClient(records[0])
}

async function createClientRecord(name: string, phone?: string, category?: string): Promise<Client> {
  const fields: Record<string, unknown> = { [CLIENTS.CLIENT_NAME]: name }
  if (phone) fields[CLIENTS.PHONE] = phone
  if (category) fields[CLIENTS.CATEGORY] = category
  const res = await fetchWithRetry(tblUrl(CLIENTS.TABLE_ID), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ records: [{ fields }] }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error creating client ${res.status}: ${body}`)
  }
  const data = (await res.json()) as { records: RawRecord[] }
  if (!data.records[0]) throw new Error('Airtable returned empty records for client creation')
  return transformClient(data.records[0])
}

async function updateClientCategory(clientId: string, category: string): Promise<void> {
  const res = await fetchWithRetry(recUrl(CLIENTS.TABLE_ID, clientId), {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields: { [CLIENTS.CATEGORY]: category } }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error updating client category ${res.status}: ${body}`)
  }
}

// Category is a client-level attribute. On create we set it; for an existing client
// we keep it in sync with the latest selection (last-write-wins).
async function getOrCreateClient(name: string, phone?: string, category?: string): Promise<Client> {
  const existing = await findClientByName(name)
  if (existing) {
    if (category && existing.category !== category) {
      await updateClientCategory(existing.id, category)
      return { ...existing, category: category as Client['category'] }
    }
    return existing
  }
  return createClientRecord(name, phone, category)
}

export async function createEndUser(input: {
  name: string
  phoneOrEmail?: string
  projectId: string
  clientId?: string
}): Promise<void> {
  const fields: Record<string, unknown> = {
    [END_USERS.NAME]: input.name,
    [END_USERS.PROJECT]: [input.projectId],
  }
  if (input.phoneOrEmail) fields[END_USERS.PHONE_EMAIL] = input.phoneOrEmail
  if (input.clientId) fields[END_USERS.CLIENT] = [input.clientId]
  const res = await fetchWithRetry(tblUrl(END_USERS.TABLE_ID), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error creating End User ${res.status}: ${body}`)
  }
}

// ─── Projects ─────────────────────────────────────────────────────────────────

async function getFabricationActiveProjectIds(): Promise<Set<string>> {
  const fabTasks = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: `AND(FIND("Fabrication", ARRAYJOIN({${TASKS.DEPARTMENT}}, ",")), NOT({${TASKS.STATUS}} = "Locked"), NOT({${TASKS.STATUS}} = "Completed"))`,
    fields: [TASKS.PROJECT],
  })
  const ids = new Set<string>()
  for (const r of fabTasks) {
    const pid = str(r.fields[TASKS.PROJECT])
    if (pid) ids.add(pid)
  }
  return ids
}

export async function getProjectIdsForSedByEmail(email: string): Promise<string[]> {
  const records = await fetchAll(PROJECTS.TABLE_ID, {
    filterByFormula: `{${PROJECTS.SALES_OWNER}} = "${escAtStr(email)}"`,
    fields: [PROJECTS.SALES_OWNER],
  })
  return records.map((r) => r.id)
}

export async function getProjects(options: { stage?: string; sedEmail?: string; sedAirtableMemberId?: string; allowedStages?: string[]; includeAllStages?: boolean; includeClientRequests?: boolean } = {}): Promise<Project[]> {
  const requestTypeFieldReady = !PROJECTS.REQUEST_TYPE.startsWith('REPLACE')
  // When includeClientRequests=true, include Trade/Variance projects alongside regular ones
  const noRequests = requestTypeFieldReady && !options.includeClientRequests ? `{${PROJECTS.REQUEST_TYPE}} = ""` : null
  const withNoReq = (f: string) => noRequests ? `AND(${f}, ${noRequests})` : f
  let formula = options.includeAllStages
    ? (noRequests ?? undefined)
    : withNoReq(`NOT(OR({${PROJECTS.PROJECT_STAGE}}="Closed", {${PROJECTS.PROJECT_STAGE}}="Closed and active warranty", {${PROJECTS.PROJECT_STAGE}}="Warranty expired"))`)
  if (!options.includeAllStages) {
    if (options.stage) {
      formula = withNoReq(`{${PROJECTS.PROJECT_STAGE}}="${escAtStr(options.stage)}"`)
    } else if (options.allowedStages?.length) {
      formula = withNoReq(`OR(${options.allowedStages.map((s) => `{${PROJECTS.PROJECT_STAGE}}="${escAtStr(s)}"`).join(',')})`)
    }
  }
  const [records, fabActiveIds] = await Promise.all([
    fetchAll(PROJECTS.TABLE_ID, {
      filterByFormula: formula,
      sort: [{ field: PROJECTS.PROJECT_CREATED_AT, direction: 'desc' }],
    }),
    getFabricationActiveProjectIds(),
  ])
  let projects = records.map(r => ({ ...transformProject(r), fabricationActive: fabActiveIds.has(r.id) }))
  if (options.sedAirtableMemberId || options.sedEmail) {
    const memberId = options.sedAirtableMemberId
    const email = options.sedEmail?.toLowerCase()
    projects = projects.filter(p => {
      if (memberId) {
        if (p.salesOwner?.id === memberId) return true
        if (p.communSedIds?.includes(memberId)) return true
      }
      if (email) {
        if (p.salesOwner?.email?.toLowerCase() === email) return true
      }
      return false
    })
  }
  return projects
}

export async function getAllProjects(options?: { includeClientRequests?: boolean }): Promise<Project[]> {
  const requestTypeFieldReady = !PROJECTS.REQUEST_TYPE.startsWith('REPLACE')
  const filter = requestTypeFieldReady && !options?.includeClientRequests
    ? `{${PROJECTS.REQUEST_TYPE}} = ""`
    : undefined
  const [records, fabActiveIds] = await Promise.all([
    fetchAll(PROJECTS.TABLE_ID, {
      ...(filter ? { filterByFormula: filter } : {}),
      sort: [{ field: PROJECTS.PROJECT_CREATED_AT, direction: 'desc' }],
    }),
    getFabricationActiveProjectIds(),
  ])
  return records.map(r => ({ ...transformProject(r), fabricationActive: fabActiveIds.has(r.id) }))
}

export async function projectNameExists(name: string): Promise<boolean> {
  const escaped = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const records = await fetchAll(PROJECTS.TABLE_ID, {
    filterByFormula: `{${PROJECTS.PROJECT_NAME}} = "${escaped}"`,
    fields: [PROJECTS.PROJECT_NAME],
  })
  return records.length > 0
}

export async function getProjectById(id: string): Promise<Project> {
  const res = await fetchWithRetry(recUrl(PROJECTS.TABLE_ID, id), {
    headers: airtableHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformProject(record)
}

export async function getProjectNamesByIds(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {}
  const formula = `OR(${ids.map((id) => `RECORD_ID()='${id}'`).join(',')})`
  const records = await fetchAll(PROJECTS.TABLE_ID, {
    filterByFormula: formula,
    fields: [PROJECTS.PROJECT_NAME],
  })
  const map: Record<string, string> = {}
  for (const r of records) {
    const name = r.fields[PROJECTS.PROJECT_NAME] as string | undefined
    if (name) map[r.id] = name
  }
  return map
}

export async function updateProject(
  id: string,
  fields: Record<string, unknown>,
): Promise<Project> {
  const res = await fetchWithRetry(recUrl(PROJECTS.TABLE_ID, id), {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformProject(record)
}

export async function createProject(input: ProjectCreateInput): Promise<Project> {
  const fields: Record<string, unknown> = {
    [PROJECTS.PROJECT_NAME]: input.projectName,
    [PROJECTS.PROJECT_DESCRIPTION]: input.projectDescription,
    [PROJECTS.PROJECT_STAGE]: 'Preparing',
    [PROJECTS.EMIRATE]: input.emirate,
  }

  if (input.nickname) fields[PROJECTS.NICKNAME] = input.nickname
  if (input.detailedLocation) fields[PROJECTS.DETAILED_LOCATION] = input.detailedLocation
  if (input.clientPhone) fields[PROJECTS.CLIENT_PHONE] = input.clientPhone
  if (input.location) fields[PROJECTS.LOCATION] = input.location
  if (input.locationOther) fields[PROJECTS.LOCATION_OTHER] = input.locationOther
  if (input.sedNotes) fields[PROJECTS.SED_NOTES] = input.sedNotes
  if (input.salesOwnerCollaboratorId) fields[PROJECTS.SALES_OWNER] = [input.salesOwnerCollaboratorId]
  if (input.communSedIds?.length) fields[PROJECTS.COMMUN_SEDS] = input.communSedIds

  // Client category is stored on the client record (not the project). getOrCreateClient
  // creates the client if new and keeps the category in sync for existing clients.
  const client = await getOrCreateClient(input.clientName, input.clientPhone || undefined, input.clientCategory)
  fields[PROJECTS.CLIENT_NAME] = input.clientName
  fields[PROJECTS.CLIENT] = [client.id]

  const tryCreate = async (f: Record<string, unknown>): Promise<RawRecord> => {
    const res = await fetchWithRetry(tblUrl(PROJECTS.TABLE_ID), {
      method: 'POST',
      headers: airtableHeaders(),
      body: JSON.stringify({ fields: f }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Airtable error ${res.status}: ${body}`)
    }
    return res.json() as Promise<RawRecord>
  }

  let record: RawRecord
  try {
    record = await tryCreate(fields)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('ROW_DOES_NOT_EXIST')) {
      const safeFields = { ...fields }
      delete safeFields[PROJECTS.SALES_OWNER]
      delete safeFields[PROJECTS.COMMUN_SEDS]
      console.warn('[createProject] Stale team member ID detected — project created without SED assignment')
      record = await tryCreate(safeFields)
    } else {
      throw err
    }
  }
  return transformProject(record)
}

export async function deleteProjectById(projectId: string): Promise<void> {
  const res = await fetchWithRetry(recUrl(PROJECTS.TABLE_ID, projectId), {
    method: 'DELETE',
    headers: airtableHeaders(),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error deleting project ${res.status}: ${body}`)
  }
}

export async function deleteProjectItemsByProject(projectId: string): Promise<number> {
  return deleteByProject(PROJECT_ITEMS.TABLE_ID, PROJECT_ITEMS.PROJECT, projectId)
}

export async function deletePurchaseOrdersByProject(projectId: string): Promise<number> {
  return deleteByProject(PURCHASE_ORDERS.TABLE_ID, PURCHASE_ORDERS.PROJECT, projectId)
}

export async function deleteInstallationLogsByProject(projectId: string): Promise<number> {
  return deleteByProject(INSTALLATION_LOGS.TABLE_ID, INSTALLATION_LOGS.PROJECT, projectId)
}

export async function deleteHandoverSheetsByProject(projectId: string): Promise<number> {
  return deleteByProject(HANDOVER_SHEETS.TABLE_ID, HANDOVER_SHEETS.PROJECT, projectId)
}

export async function deleteTimesheetsByProject(projectId: string): Promise<number> {
  return deleteByProject(PRODUCTION_TIMESHEETS.TABLE, PRODUCTION_TIMESHEETS.PROJECT, projectId)
}

export async function deleteChildProjectsByProject(projectId: string): Promise<string[]> {
  const records = await fetchAll(PROJECTS.TABLE_ID, {
    filterByFormula: `{${PROJECTS.PARENT_PROJECT}} = "${projectId}"`,
    fields: [PROJECTS.PROJECT_NAME],
  })
  if (records.length === 0) return []
  const ids = records.map((r) => r.id)
  for (const id of ids) {
    const res = await fetchWithRetry(recUrl(PROJECTS.TABLE_ID, id), {
      method: 'DELETE',
      headers: airtableHeaders(),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Airtable error deleting child project ${res.status}: ${body}`)
    }
  }
  return ids
}

// ─── Handover Sheets ──────────────────────────────────────────────────────────

function transformHandoverSheet(record: RawRecord): HandoverSheet {
  const f = record.fields
  return {
    id: record.id,
    handoverId: str(f[HANDOVER_SHEETS.HANDOVER_ID]),
    project: strArr(f[HANDOVER_SHEETS.PROJECT]) ?? [],
    status: str(f[HANDOVER_SHEETS.STATUS]) ?? 'Pending',
    notes: str(f[HANDOVER_SHEETS.NOTES]),
    finalInstallationDate: str(f[HANDOVER_SHEETS.FINAL_INSTALLATION_DATE]),
    customerSatisfaction: str(f[HANDOVER_SHEETS.CUSTOMER_SATISFACTION]),
    installationDifficulty: str(f[HANDOVER_SHEETS.INSTALLATION_DIFFICULTY]),
    newsletterOptIn: f[HANDOVER_SHEETS.NEWSLETTER_OPT_IN] === true,
    recordedBy: str(f[HANDOVER_SHEETS.RECORDED_BY]),
  }
}

export async function createHandoverSheet(
  projectId: string,
  data: {
    finalInstallationDate: string
    customerSatisfaction: string
    installationDifficulty: string
    newsletterOptIn?: boolean
    notes?: string
    recordedBy?: string
  },
): Promise<HandoverSheet> {
  const fields: Record<string, unknown> = {
    [HANDOVER_SHEETS.PROJECT]: [projectId],
    [HANDOVER_SHEETS.STATUS]: 'Generated',
    [HANDOVER_SHEETS.FINAL_INSTALLATION_DATE]: data.finalInstallationDate,
    [HANDOVER_SHEETS.CUSTOMER_SATISFACTION]: data.customerSatisfaction,
    [HANDOVER_SHEETS.INSTALLATION_DIFFICULTY]: data.installationDifficulty,
  }
  if (data.notes) fields[HANDOVER_SHEETS.NOTES] = data.notes
  if (data.newsletterOptIn !== undefined) fields[HANDOVER_SHEETS.NEWSLETTER_OPT_IN] = data.newsletterOptIn
  if (data.recordedBy) fields[HANDOVER_SHEETS.RECORDED_BY] = data.recordedBy
  const res = await fetchWithRetry(tblUrl(HANDOVER_SHEETS.TABLE_ID), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ records: [{ fields }] }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const data2 = (await res.json()) as { records: RawRecord[] }
  if (!data2.records[0]) throw new Error('Airtable returned empty records for handover sheet creation')
  return transformHandoverSheet(data2.records[0])
}

export async function updateHandoverSheet(
  sheetId: string,
  data: {
    finalInstallationDate: string
    customerSatisfaction: string
    installationDifficulty: string
    newsletterOptIn?: boolean
    notes?: string
    recordedBy?: string
  },
): Promise<HandoverSheet> {
  const fields: Record<string, unknown> = {
    [HANDOVER_SHEETS.STATUS]: 'Generated',
    [HANDOVER_SHEETS.FINAL_INSTALLATION_DATE]: data.finalInstallationDate,
    [HANDOVER_SHEETS.CUSTOMER_SATISFACTION]: data.customerSatisfaction,
    [HANDOVER_SHEETS.INSTALLATION_DIFFICULTY]: data.installationDifficulty,
  }
  if (data.notes) fields[HANDOVER_SHEETS.NOTES] = data.notes
  if (data.newsletterOptIn !== undefined) fields[HANDOVER_SHEETS.NEWSLETTER_OPT_IN] = data.newsletterOptIn
  if (data.recordedBy) fields[HANDOVER_SHEETS.RECORDED_BY] = data.recordedBy
  const res = await fetchWithRetry(`${tblUrl(HANDOVER_SHEETS.TABLE_ID)}/${sheetId}`, {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const updated = (await res.json()) as RawRecord
  return transformHandoverSheet(updated)
}

export async function getHandoverSheetForProject(projectId: string): Promise<HandoverSheet[]> {
  const records = await fetchAll(HANDOVER_SHEETS.TABLE_ID, {
    sort: [{ field: HANDOVER_SHEETS.FINAL_INSTALLATION_DATE, direction: 'desc' }],
  })
  return records
    .filter((r) => strArr(r.fields[HANDOVER_SHEETS.PROJECT]).includes(projectId))
    .map(transformHandoverSheet)
}

// ─── Calendar project picker ──────────────────────────────────────────────────

export interface CalendarProject {
  id: string
  name: string
  quotationNumber?: string
  quotationReference?: string
  assignedTeamIds?: string[]
}

export async function getCalendarProjects(): Promise<CalendarProject[]> {
  const today = todayUAE()

  const [projects, expiredMaint] = await Promise.all([
    fetchAll(PROJECTS.TABLE_ID, {
      fields: [
        PROJECTS.PROJECT_ID,
        PROJECTS.PROJECT_NAME,
        PROJECTS.NICKNAME,
        PROJECTS.QUOTATION_NUMBER,
        PROJECTS.QUOTATION_REFERENCE,
        PROJECTS.INSTALLATION_TEAM_MEMBERS,
      ],
    }),
    fetchAll(MAINTENANCE.TABLE_ID, {
      filterByFormula: `AND(NOT({${MAINTENANCE.END_DATE}}=BLANK()),IS_BEFORE({${MAINTENANCE.END_DATE}},"${today}"))`,
      fields: [MAINTENANCE.PROJECTS],
    }).catch(() => [] as RawRecord[]),
  ])

  const expiredProjectIds = new Set<string>()
  for (const m of expiredMaint) {
    const linked = m.fields[MAINTENANCE.PROJECTS]
    if (Array.isArray(linked)) linked.forEach((id) => expiredProjectIds.add(id as string))
  }

  return projects
    .filter((p) => !expiredProjectIds.has(p.id))
    .map((p) => ({
      id: p.id,
      name:
        str(p.fields[PROJECTS.NICKNAME]) ??
        str(p.fields[PROJECTS.PROJECT_NAME]) ??
        str(p.fields[PROJECTS.PROJECT_ID]) ??
        p.id,
      quotationNumber: str(p.fields[PROJECTS.QUOTATION_NUMBER]),
      quotationReference: str(p.fields[PROJECTS.QUOTATION_REFERENCE]),
      assignedTeamIds: strArr(p.fields[PROJECTS.INSTALLATION_TEAM_MEMBERS]) || undefined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
