// Client Requests domain (Trade, Maintenance, Variance sub-projects)

import { ClientRequest, ClientRequestCreateInput, Task } from '../types'
import {
  PROJECTS,
  TASKS,
  fetchAll,
  fetchWithRetry,
  airtableHeaders,
  tblUrl,
  RawRecord,
  str,
  selectName,
  firstLinkedRecord,
  transformProject,
  transformTask,
} from './_client'
import { getProjectById, updateProject } from './projects'
import { generateTasksForProject } from './tasks'
import { getPaymentsByProjectIds } from './payments'

// Template IDs that provide department metadata for client request tasks
const CR_TEMPLATE_SED     = 'rec6xYWnAAWOKyVr7' // Department = SED
const CR_TEMPLATE_PAYMENT = 'recRX4dqaaY5RsPdH' // Department = Manager

// Belt-and-suspenders: guarantee these functions can never return a plain project,
// regardless of what the Airtable-side {REQUEST_TYPE} != "" formula did.
const VALID_REQUEST_TYPES = new Set(['Trade', 'Maintenance', 'Variance'])

const TRADE_TASKS = [
  { name: 'F3 — Order Trade Material',    order: 100, templateId: CR_TEMPLATE_SED },
  { name: 'F4 — Trade Payment',           order: 101, templateId: CR_TEMPLATE_PAYMENT },
  { name: 'Handover to Client',           order: 102, templateId: CR_TEMPLATE_SED },
] as const

const MAINTENANCE_TASKS = [
  { name: 'Site Visit & Assessment',    order: 100, templateId: CR_TEMPLATE_SED },
  { name: 'Carry Out Maintenance Work', order: 101, templateId: CR_TEMPLATE_SED },
  { name: 'Client Sign-off',           order: 102, templateId: CR_TEMPLATE_SED },
] as const

export async function createClientRequest(
  input: ClientRequestCreateInput,
): Promise<{ project: import('../types').Project; tasksCreated: number; taskGenerationFailed?: boolean }> {
  if (PROJECTS.REQUEST_TYPE.startsWith('REPLACE')) {
    throw new Error('Client Requests feature requires Airtable field IDs to be configured in fieldMap.ts')
  }
  const isTrade    = input.requestType === 'Trade'
  const isVariance = input.requestType === 'Variance'
  let parentProjectName: string | undefined

  if (input.parentProjectId) {
    try {
      const parent = await getProjectById(input.parentProjectId)
      parentProjectName = parent.projectName
    } catch {
      // parent name is cosmetic; don't fail the whole request
    }
  }

  const prefix = isTrade ? '[Trade]' : isVariance ? '[Variance]' : '[Maintenance]'
  const projectName = `${prefix} ${parentProjectName ?? input.clientName}`

  const fields: Record<string, unknown> = {
    [PROJECTS.PROJECT_NAME]: projectName,
    [PROJECTS.CLIENT_NAME]: input.clientName,
    [PROJECTS.PROJECT_STAGE]: 'Preparing',
    [PROJECTS.REQUEST_TYPE]: input.requestType,
  }
  if (input.clientPhone) fields[PROJECTS.CLIENT_PHONE] = input.clientPhone
  if (input.description) fields[PROJECTS.PROJECT_DESCRIPTION] = input.description
  if (input.salesOwnerCollaboratorId) fields[PROJECTS.SALES_OWNER] = [input.salesOwnerCollaboratorId]
  if (input.parentProjectId) fields[PROJECTS.PARENT_PROJECT] = [input.parentProjectId]
  if ((isTrade || isVariance) && input.tradeReference) fields[PROJECTS.TRADE_REFERENCE] = input.tradeReference

  const projRes = await fetchWithRetry(tblUrl(PROJECTS.TABLE_ID), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!projRes.ok) {
    const body = await projRes.text()
    throw new Error(`Airtable error ${projRes.status}: ${body}`)
  }
  const projRecord: RawRecord = await projRes.json()
  const project = transformProject(projRecord)

  if (isVariance) {
    try {
      const result = await generateTasksForProject(project.id, 'Preparing')
      return { project, tasksCreated: result.created }
    } catch (err) {
      console.error('[createClientRequest] Variance task generation failed:', err)
      return { project, tasksCreated: 0, taskGenerationFailed: true }
    }
  }

  const taskDefs = isTrade ? TRADE_TASKS : MAINTENANCE_TASKS
  const taskRecords = taskDefs.map((t, i) => ({
    [TASKS.TASK_NAME]: t.name,
    [TASKS.PROJECT]: project.id,
    [TASKS.STATUS]: i === 0 ? 'To Do' : 'Locked',
    [TASKS.TASK_TEMPLATES_LINK]: [t.templateId],
  }))

  const taskIds: string[] = []
  for (let i = 0; i < taskRecords.length; i += 10) {
    const chunk = taskRecords.slice(i, i + 10)
    const reqBody = JSON.stringify({ records: chunk.map((fields) => ({ fields })) })
    const res = await fetchWithRetry(tblUrl(TASKS.TABLE_ID), {
      method: 'POST',
      headers: airtableHeaders(),
      body: reqBody,
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Airtable error ${res.status}: ${body}`)
    }
    const data = (await res.json()) as { records: RawRecord[] }
    taskIds.push(...data.records.map((r) => r.id))
  }
  return { project, tasksCreated: taskIds.length }
}

export async function getClientRequests(options?: {
  sedAirtableMemberId?: string
}): Promise<ClientRequest[]> {
  if (PROJECTS.REQUEST_TYPE.startsWith('REPLACE')) return []

  const allRecords = await fetchAll(PROJECTS.TABLE_ID, {
    filterByFormula: `{${PROJECTS.REQUEST_TYPE}} != ""`,
    sort: [{ field: PROJECTS.PROJECT_CREATED_AT, direction: 'desc' }],
  })

  const memberId = options?.sedAirtableMemberId
  const scopedRecords = memberId
    ? allRecords.filter((r) => {
        const owner = firstLinkedRecord(r.fields[PROJECTS.SALES_OWNER])
        if (owner?.id === memberId) return true
        const rawCommun = r.fields[PROJECTS.COMMUN_SEDS]
        const communIds: string[] = Array.isArray(rawCommun)
          ? (rawCommun as Array<string | { id?: string }>).map((c) =>
              typeof c === 'string' ? c : (c.id ?? ''),
            ).filter(Boolean)
          : []
        return communIds.includes(memberId)
      })
    : allRecords
  const projects = scopedRecords.filter((r) => VALID_REQUEST_TYPES.has(str(r.fields[PROJECTS.REQUEST_TYPE]) ?? ''))
  if (projects.length === 0) return []

  const projectIds = projects.map((r) => r.id)

  const taskFormula = `OR(${projectIds.map((id) => `{${TASKS.PROJECT}} = "${id}"`).join(',')})`
  const taskRecords = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: taskFormula,
    fields: [TASKS.PROJECT, TASKS.TASK_NAME, TASKS.STATUS, TASKS.TEMPLATE_ORDER, TASKS.DEPARTMENT],
  })

  const tasksByProject = new Map<string, Task[]>()
  for (const tr of taskRecords) {
    const pid = str(tr.fields[TASKS.PROJECT])
    if (!pid) continue
    if (!tasksByProject.has(pid)) tasksByProject.set(pid, [])
    tasksByProject.get(pid)!.push(transformTask(tr))
  }

  return projects.map((r) => {
    const p = transformProject(r)
    return {
      id: p.id,
      projectName: p.projectName,
      clientName: p.clientName,
      clientPhone: p.clientPhone,
      requestType: p.requestType as 'Trade' | 'Maintenance' | 'Variance',
      projectStage: p.projectStage,
      createdAt: p.projectCreatedAt,
      description: p.projectDescription,
      parentProjectId: p.parentProjectId,
      parentProjectName: p.parentProjectName,
      tradeReference: p.tradeReference,
      tasks: tasksByProject.get(p.id) ?? [],
    }
  })
}

export async function getClientRequestsByParentProject(parentProjectId: string): Promise<ClientRequest[]> {
  if (PROJECTS.PARENT_PROJECT.startsWith('REPLACE')) return []
  const formula = `FIND("${parentProjectId}", ARRAYJOIN({${PROJECTS.PARENT_PROJECT}}, ","))`
  const allProjects = await fetchAll(PROJECTS.TABLE_ID, {
    filterByFormula: formula,
    sort: [{ field: PROJECTS.PROJECT_CREATED_AT, direction: 'desc' }],
  })
  // Belt-and-suspenders: only records with a genuine request type qualify as
  // "linked requests" — a PARENT_PROJECT link alone isn't enough.
  const projects = allProjects.filter((r) => VALID_REQUEST_TYPES.has(str(r.fields[PROJECTS.REQUEST_TYPE]) ?? ''))
  if (projects.length === 0) return []

  const projectIds = projects.map((r) => r.id)
  const taskFormula = `OR(${projectIds.map((id) => `{${TASKS.PROJECT}} = "${id}"`).join(',')})`

  const [taskRecords, allPayments] = await Promise.all([
    fetchAll(TASKS.TABLE_ID, {
      filterByFormula: taskFormula,
      fields: [TASKS.PROJECT, TASKS.TASK_NAME, TASKS.STATUS, TASKS.TEMPLATE_ORDER, TASKS.DEPARTMENT],
    }),
    getPaymentsByProjectIds(projectIds),
  ])

  const tasksByProject = new Map<string, Task[]>()
  for (const tr of taskRecords) {
    const pid = str(tr.fields[TASKS.PROJECT])
    if (!pid) continue
    if (!tasksByProject.has(pid)) tasksByProject.set(pid, [])
    tasksByProject.get(pid)!.push(transformTask(tr))
  }

  const paymentsByProject = new Map<string, typeof allPayments>()
  for (const pay of allPayments) {
    const pid = pay.project?.[0]
    if (!pid) continue
    if (!paymentsByProject.has(pid)) paymentsByProject.set(pid, [])
    paymentsByProject.get(pid)!.push(pay)
  }

  return projects.map((r) => {
    const p = transformProject(r)
    const payments = paymentsByProject.get(p.id) ?? []
    const paymentTotal = payments
      .filter((pay) => pay.paymentStatus !== 'Cancelled')
      .reduce((sum, pay) => sum + (pay.amount ?? 0), 0)
    return {
      id: p.id,
      projectName: p.projectName,
      clientName: p.clientName,
      clientPhone: p.clientPhone,
      requestType: p.requestType as 'Trade' | 'Maintenance' | 'Variance',
      projectStage: p.projectStage,
      createdAt: p.projectCreatedAt,
      description: p.projectDescription,
      parentProjectId: p.parentProjectId,
      parentProjectName: p.parentProjectName,
      tradeReference: p.tradeReference,
      tasks: tasksByProject.get(p.id) ?? [],
      payments,
      paymentTotal,
    }
  })
}

export async function updateClientRequestTradeReference(
  requestProjectId: string,
  tradeReference: string,
): Promise<void> {
  await updateProject(requestProjectId, { [PROJECTS.TRADE_REFERENCE]: tradeReference })
}

// Maps every parent project ID to a formatted, comma-joined label of its linked
// Trade/Maintenance/Variance requests, e.g. "Trade (2341Tr1), Variance (2341Vr1)".
// Used by report exports so a project's row can show a "Client Requests" column
// instead of the requests appearing as separate, independent-looking rows.
export async function getClientRequestLabelsByParent(): Promise<Map<string, string>> {
  if (PROJECTS.REQUEST_TYPE.startsWith('REPLACE')) return new Map()

  const records = await fetchAll(PROJECTS.TABLE_ID, {
    filterByFormula: `{${PROJECTS.REQUEST_TYPE}} != ""`,
    fields: [PROJECTS.REQUEST_TYPE, PROJECTS.PARENT_PROJECT, PROJECTS.TRADE_REFERENCE],
  })

  const labelsByParent = new Map<string, string[]>()
  for (const r of records) {
    const parentId = firstLinkedRecord(r.fields[PROJECTS.PARENT_PROJECT])?.id
    if (!parentId) continue
    const type = selectName(r.fields[PROJECTS.REQUEST_TYPE]) ?? ''
    const ref = str(r.fields[PROJECTS.TRADE_REFERENCE])
    const label = ref ? `${type} (${ref})` : type
    if (!labelsByParent.has(parentId)) labelsByParent.set(parentId, [])
    labelsByParent.get(parentId)!.push(label)
  }

  const result = new Map<string, string>()
  for (const [parentId, labels] of labelsByParent) result.set(parentId, labels.join(', '))
  return result
}
