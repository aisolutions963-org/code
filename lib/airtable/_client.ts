// Core Airtable fetch helpers, constants, and shared transform utilities.
// This module is internal — nothing here is imported directly by app code.

import {
  CLIENTS,
  TASKS,
  TASK_TEMPLATES,
  PROJECTS,
  PROJECT_ITEMS,
  PAYMENTS,
  MAINTENANCE,
  TEAM_MEMBERS,
  ANNOUNCEMENTS,
  MATERIALS_NEEDED,
  HANDOVER_SHEETS,
  QUOTATIONS,
  PURCHASE_ORDERS,
  INSTALLATION_LOGS,
  CALENDAR_EVENTS,
  PRODUCTION_TIMESHEETS,
  WORKERS,
  END_USERS,
} from '../fieldMap'
import { validateEnv } from '../env'
import { recordAirtableFailure } from '../metrics'
import type { Attachment, Task, Payment, MaintenanceRecord } from '../types'

export {
  CLIENTS,
  TASKS,
  TASK_TEMPLATES,
  PROJECTS,
  PROJECT_ITEMS,
  PAYMENTS,
  MAINTENANCE,
  TEAM_MEMBERS,
  ANNOUNCEMENTS,
  MATERIALS_NEEDED,
  HANDOVER_SHEETS,
  QUOTATIONS,
  PURCHASE_ORDERS,
  INSTALLATION_LOGS,
  CALENDAR_EVENTS,
  PRODUCTION_TIMESHEETS,
  WORKERS,
  END_USERS,
}

validateEnv()

const BASE_ID = process.env.AIRTABLE_BASE_ID!
const API_KEY = process.env.AIRTABLE_API_KEY!
export const BASE_URL = 'https://api.airtable.com/v0'

export function airtableHeaders() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  }
}

export function recUrl(tableId: string, id: string): string {
  return `${BASE_URL}/${BASE_ID}/${tableId}/${id}?returnFieldsByFieldId=true`
}

export function tblUrl(tableId: string): string {
  return `${BASE_URL}/${BASE_ID}/${tableId}?returnFieldsByFieldId=true`
}

// ─── Rate limiting + retry ───────────────────────────────────────────────────

let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 250

async function rateLimitedFetch(url: string, options: RequestInit): Promise<Response> {
  const now = Date.now()
  const elapsed = now - lastRequestTime
  if (elapsed < MIN_REQUEST_INTERVAL) {
    await new Promise((r) => setTimeout(r, MIN_REQUEST_INTERVAL - elapsed))
  }
  lastRequestTime = Date.now()
  return fetch(url, options)
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const response = await rateLimitedFetch(url, options)
    if (response.status === 429 || response.status === 503) {
      recordAirtableFailure()
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, attempt * 1000))
        continue
      }
    }
    return response
  }
  recordAirtableFailure()
  throw new Error('Airtable request failed after retries')
}

export function buildUrl(
  tableId: string,
  opts: {
    filterByFormula?: string
    sort?: { field: string; direction?: 'asc' | 'desc' }[]
    fields?: string[]
    maxRecords?: number
    offset?: string
  } = {},
): string {
  const parts: string[] = []
  if (opts.filterByFormula) {
    parts.push(`filterByFormula=${encodeURIComponent(opts.filterByFormula)}`)
  }
  if (opts.sort) {
    opts.sort.forEach((s, i) => {
      parts.push(`sort[${i}][field]=${encodeURIComponent(s.field)}`)
      parts.push(`sort[${i}][direction]=${s.direction ?? 'asc'}`)
    })
  }
  if (opts.fields) {
    opts.fields.forEach((f) => parts.push(`fields[]=${encodeURIComponent(f)}`))
  }
  if (opts.maxRecords) parts.push(`maxRecords=${opts.maxRecords}`)
  if (opts.offset) parts.push(`offset=${encodeURIComponent(opts.offset)}`)
  parts.push('returnFieldsByFieldId=true')
  return `${BASE_URL}/${BASE_ID}/${tableId}?${parts.join('&')}`
}

export interface RawRecord {
  id: string
  createdTime: string
  fields: Record<string, unknown>
}

export async function fetchAll(
  tableId: string,
  opts: Parameters<typeof buildUrl>[1],
): Promise<RawRecord[]> {
  const records: RawRecord[] = []
  let offset: string | undefined
  do {
    const url = buildUrl(tableId, { ...opts, offset })
    const res = await fetchWithRetry(url, { headers: airtableHeaders(), cache: 'no-store' })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Airtable error ${res.status}: ${body}`)
    }
    const data = (await res.json()) as { records: RawRecord[]; offset?: string }
    records.push(...data.records)
    offset = data.offset
  } while (offset)
  return records
}

export async function deleteByProject(tableId: string, projectField: string, projectId: string): Promise<number> {
  const records = await fetchAll(tableId, {
    filterByFormula: `{${projectField}} = "${projectId}"`,
    fields: [projectField],
  })
  if (records.length === 0) return 0
  let deleted = 0
  for (let i = 0; i < records.length; i += 10) {
    const chunk = records.slice(i, i + 10)
    const qs = chunk.map((r) => `records[]=${r.id}`).join('&')
    const res = await fetchWithRetry(`${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/${tableId}?${qs}`, {
      method: 'DELETE',
      headers: airtableHeaders(),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Airtable delete error (${tableId}) ${res.status}: ${body}`)
    }
    deleted += chunk.length
  }
  return deleted
}

// ─── Transform helpers ───────────────────────────────────────────────────────

export function str(val: unknown): string | undefined {
  return typeof val === 'string' ? val : undefined
}
export function num(val: unknown): number | undefined {
  return typeof val === 'number' ? val : undefined
}
export function bool(val: unknown): boolean | undefined {
  return typeof val === 'boolean' ? val : undefined
}
export function strArr(val: unknown): string[] {
  return Array.isArray(val) ? (val as string[]) : []
}
export function lookupStrArr(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter((v): v is string => typeof v === 'string')
  if (val && typeof val === 'object') {
    const byId = (val as { valuesByLinkedRecordId?: Record<string, unknown[]> }).valuesByLinkedRecordId
    if (byId) {
      return Object.values(byId)
        .flat()
        .filter((v): v is string => typeof v === 'string')
    }
  }
  return []
}
export function numArr(val: unknown): number[] {
  return Array.isArray(val) ? (val as number[]) : []
}
// Handles multipleLookupValues returning {valuesByLinkedRecordId: {recId: [n]}}
export function lookupNumArr(val: unknown): number[] {
  if (Array.isArray(val)) return val.filter((v): v is number => typeof v === 'number')
  if (val && typeof val === 'object') {
    const byId = (val as { valuesByLinkedRecordId?: Record<string, unknown[]> }).valuesByLinkedRecordId
    if (byId) {
      return Object.values(byId)
        .flat()
        .filter((v): v is number => typeof v === 'number')
    }
  }
  return []
}
export function boolArr(val: unknown): boolean[] {
  return Array.isArray(val) ? (val as boolean[]) : []
}
// Handles multipleLookupValues of a checkbox field
export function lookupBoolArr(val: unknown): boolean[] {
  if (Array.isArray(val)) return val.filter((v): v is boolean => typeof v === 'boolean')
  if (val && typeof val === 'object') {
    const byId = (val as { valuesByLinkedRecordId?: Record<string, unknown[]> }).valuesByLinkedRecordId
    if (byId) {
      return Object.values(byId)
        .flat()
        .filter((v): v is boolean => typeof v === 'boolean')
    }
  }
  return []
}
// Extracts .name from a singleSelect field (returned as {id, name, color} object)
export function selectName(val: unknown): string | undefined {
  if (typeof val === 'string') return val
  if (val && typeof val === 'object') {
    const name = (val as { name?: string }).name
    if (typeof name === 'string') return name
  }
  return undefined
}
// Extracts the first linked record from a multipleRecordLinks field.
// Handles both string IDs (["recXXXX"]) and expanded objects ([{id, name, email}]).
export function firstLinkedRecord(val: unknown): { id: string; name: string; email: string } | undefined {
  const arr = Array.isArray(val) ? val : (val ? [val] : [])
  if (arr.length === 0) return undefined
  const entry = arr[0]
  if (typeof entry === 'string') return { id: entry, name: '', email: '' }
  if (entry && typeof entry === 'object') {
    const r = entry as { id?: string; name?: string; email?: string }
    return { id: r.id ?? '', name: r.name ?? '', email: r.email ?? '' }
  }
  return undefined
}

// Handles multipleLookupValues of a multipleSelects field — each value is {id, name, color}
export function lookupSelectNames(val: unknown): string[] {
  const items: unknown[] = []
  if (Array.isArray(val)) {
    items.push(...val)
  } else if (val && typeof val === 'object') {
    const byId = (val as { valuesByLinkedRecordId?: Record<string, unknown[]> }).valuesByLinkedRecordId
    if (byId) items.push(...Object.values(byId).flat())
  }
  return items
    .map((v) =>
      typeof v === 'string' ? v : (v as Record<string, unknown>)?.name as string | undefined,
    )
    .filter((v): v is string => typeof v === 'string')
}

export function parseDocLinks(val: unknown): import('../types').DocLink[] {
  if (!val || typeof val !== 'string') return []
  try {
    const parsed = JSON.parse(val)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (d): d is import('../types').DocLink =>
        d && typeof d.label === 'string',
    )
  } catch {
    return []
  }
}

export function attachments(val: unknown): Attachment[] {
  if (!Array.isArray(val)) return []
  return (val as Record<string, unknown>[]).map((a) => ({
    id: a.id as string,
    url: a.url as string,
    filename: a.filename as string,
    size: a.size as number | undefined,
    type: (a.type ?? a.mimeType) as string | undefined,
  }))
}

// ─── Transform functions ─────────────────────────────────────────────────────

export function transformTask(record: RawRecord): Task {
  const f = record.fields
  return {
    id: record.id,
    taskName: (str(f[TASKS.TASK_NAME]) ?? ''),
    status: (str(f[TASKS.STATUS]) ?? 'To Do') as Task['status'],
    department: lookupSelectNames(f[TASKS.DEPARTMENT]),
    taskOrder: numArr(f[TASKS.TASK_ORDER]),
    templateOrder: lookupNumArr(f[TASKS.TEMPLATE_ORDER]),
    projectId: str(f[TASKS.PROJECT_ID]),
    project: str(f[TASKS.PROJECT]) ? [str(f[TASKS.PROJECT])!] : [],
    projectRecordId: str(f[TASKS.PROJECT]) ?? undefined,
    projectItem: strArr(f[TASKS.PROJECT_ITEM]),
    taskDocuments: attachments(f[TASKS.TASK_DOCUMENTS]),
    fillersAndMissingList: attachments(f[TASKS.FILLERS_MISSING_ITEMS_LIST]),
    instructions: lookupStrArr(f[TASKS.INSTRUCTIONS]),
    arabicInstructions: lookupStrArr(f[TASKS.ARABIC_INSTRUCTIONS]),
    managerReviewStatus: str(f[TASKS.MANAGER_REVIEW_STATUS]) as Task['managerReviewStatus'],
    managerComment: str(f[TASKS.MANAGER_COMMENT]),
    requiresManagerReview: lookupBoolArr(f[TASKS.REQUIRES_MANAGER_REVIEW]),
    requiresManagerReviewManually: bool(f[TASKS.REQUIRES_MANAGER_REVIEW_MANUALLY]),
    postVisitOutcome: str(f[TASKS.POST_VISIT_OUTCOME]),
    taskStartDate: str(f[TASKS.TASK_START_DATE]),
    completionDate: str(f[TASKS.COMPLETION_DATE]),
    startedAt: str(f[TASKS.STARTED_AT]),
    completedAt: str(f[TASKS.COMPLETED_AT]),
    estimatedDuration: num(f[TASKS.ESTIMATED_DURATION]),
    teamDaysRequired: num(f[TASKS.TEAM_DAYS_REQUIRED]),
    noOfLaborsPerDay: num(f[TASKS.NO_OF_LABORS_PER_DAY]),
    installationDays: num(f[TASKS.INSTALLATION_DAYS]),
    installationSchedule: str(f[TASKS.INSTALLATION_SCHEDULE]),
    plannedProdStartDate: str(f[TASKS.PLANNED_PROD_START_DATE]),
    expectedFabEndDate: str(f[TASKS.EXPECTED_FAB_END_DATE]),
    fabricationPath: str(f[TASKS.FABRICATION_PATH]),
    postCarpentryPath: str(f[TASKS.POST_CARPENTRY_PATH]),
    productionStartPath: str(f[TASKS.PRODUCTION_START_PATH]),
    conceptDesignApproval: str(f[TASKS.CONCEPT_DESIGN_APPROVAL]),
    sampleApproval: str(f[TASKS.SAMPLE_APPROVAL]),
    quotationOutcome: str(f[TASKS.QUOTATION_OUTCOME]),
    qcCheckAtSiteDone: bool(f[TASKS.QC_CHECK_AT_SITE_DONE]),
    fillersDone: bool(f[TASKS.FILLERS_DONE]),
    priorityFlag: bool(f[TASKS.PRIORITY_FLAG]),
    projectStage: strArr(f[TASKS.PROJECT_STAGE]),
    client: strArr(f[TASKS.CLIENT]),
    taskCreated: str(f[TASKS.TASK_CREATED]),
    lastModified: str(f[TASKS.LAST_MODIFIED]),
    assignedTo: strArr(f[TASKS.ASSIGNED_TO]),
    callCount: num(f[TASKS.CALL_COUNT]),
    sedNote: str(f[TASKS.SED_NOTE]),
    superadminNote: str(f[TASKS.SUPERADMIN_NOTE]),
    followUpOutcome: str(f[TASKS.FOLLOW_UP_OUTCOME]),
    pathCondition: selectName(f[TASKS.PATH_CONDITION]),
    taskDocLinks: parseDocLinks(f[TASKS.TASK_DOC_LINKS]),
    fillersDocLinks: parseDocLinks(f[TASKS.FILLERS_DOC_LINKS]),
  }
}

export function transformProject(record: RawRecord): import('../types').Project {
  const f = record.fields
  const owner = firstLinkedRecord(f[PROJECTS.SALES_OWNER])
  const rawCommun = f[PROJECTS.COMMUN_SEDS]
  const communRaw: Array<string | { name?: string; email?: string; id?: string }> =
    Array.isArray(rawCommun) ? rawCommun : []
  const communSeds = communRaw
    .map((c) => (typeof c === 'string' ? c : (c.name ?? c.email ?? c.id ?? '')))
    .filter(Boolean)
  const communSedIds = communRaw
    .map((c) => (typeof c === 'string' ? c : (c.id ?? '')))
    .filter(Boolean)
  const quotationNumber = str(f[PROJECTS.QUOTATION_NUMBER])
  const quotationReference = str(f[PROJECTS.QUOTATION_REFERENCE])
  const projectId =
    quotationNumber && quotationReference ? `${quotationNumber}${quotationReference}` :
    quotationNumber ? quotationNumber :
    quotationReference ? quotationReference :
    str(f[PROJECTS.PROJECT_ID]) || ''
  return {
    id: record.id,
    projectName: str(f[PROJECTS.PROJECT_NAME]) ?? '',
    nickname: str(f[PROJECTS.NICKNAME]),
    projectId,
    quotationNumber: quotationNumber ?? undefined,
    quotationReference: quotationReference ?? undefined,
    projectStage: str(f[PROJECTS.PROJECT_STAGE]) ?? '',
    clientName: str(f[PROJECTS.CLIENT_NAME]) ?? '',
    salesOwner: owner,
    paymentMode: str(f[PROJECTS.PAYMENT_MODE]),
    projectTotalCost: num(f[PROJECTS.PROJECT_TOTAL_COST]),
    totalPaid: num(f[PROJECTS.TOTAL_PAID]),
    remainingBalance: num(f[PROJECTS.REMAINING_BALANCE]),
    paymentProgress: num(f[PROJECTS.PAYMENT_PROGRESS]),
    lastModifiedTasks: str(f[PROJECTS.LAST_MODIFIED_TASKS]),
    approvalStatus: str(f[PROJECTS.APPROVAL_STATUS]),
    taskIds: strArr(f[PROJECTS.TASKS]),
    projectItemIds: strArr(f[PROJECTS.PROJECT_ITEMS]),
    paymentIds: strArr(f[PROJECTS.PAYMENTS]),
    managerNotes: str(f[PROJECTS.MANAGER_NOTES]),
    sedNotes: str(f[PROJECTS.SED_NOTES]),
    projectCreatedAt: str(f[PROJECTS.PROJECT_CREATED_AT]),
    clientPhone: str(f[PROJECTS.CLIENT_PHONE]),
    assignedInstallationTeam: strArr(f[PROJECTS.INSTALLATION_TEAM_MEMBERS]),
    emirate: str(f[PROJECTS.EMIRATE]),
    location: str(f[PROJECTS.LOCATION]),
    detailedLocation: str(f[PROJECTS.DETAILED_LOCATION]),
    projectDescription: str(f[PROJECTS.PROJECT_DESCRIPTION]),
    communSeds: communSeds.length > 0 ? communSeds : undefined,
    communSedIds: communSedIds.length > 0 ? communSedIds : undefined,
    requestType: (str(f[PROJECTS.REQUEST_TYPE]) as 'Trade' | 'Maintenance' | 'Variance' | undefined) ?? undefined,
    parentProjectId: firstLinkedRecord(f[PROJECTS.PARENT_PROJECT])?.id ?? undefined,
    parentProjectName: firstLinkedRecord(f[PROJECTS.PARENT_PROJECT])?.name ?? undefined,
    tradeReference: str(f[PROJECTS.TRADE_REFERENCE]) ?? undefined,
  }
}

export function transformPayment(record: RawRecord): Payment {
  const f = record.fields
  return {
    id: record.id,
    name: str(f[PAYMENTS.NAME]) ?? '',
    project: strArr(f[PAYMENTS.PROJECT]),
    amount: num(f[PAYMENTS.AMOUNT]) ?? 0,
    paymentType: str(f[PAYMENTS.PAYMENT_TYPE]) ?? '',
    paymentStatus: str(f[PAYMENTS.PAYMENT_STATUS]) ?? '',
    paymentMethod: str(f[PAYMENTS.PAYMENT_METHOD]) ?? '',
    referenceNo: str(f[PAYMENTS.REFERENCE_NO]),
    receivedDate: str(f[PAYMENTS.RECEIVED_DATE]),
    dueDate: str(f[PAYMENTS.DUE_DATE]),
    accountantApproved: bool(f[PAYMENTS.ACCOUNTANT_APPROVED]),
    stageAtPayment: str(f[PAYMENTS.STAGE_AT_PAYMENT]),
    payerType: str(f[PAYMENTS.PAYER_TYPE]),
    payerName: str(f[PAYMENTS.PAYER_NAME]),
    commissionAmount: num(f[PAYMENTS.COMMISSION_AMOUNT]),
    notes: str(f[PAYMENTS.NOTES]),
    recordedBy: str(f[PAYMENTS.RECORDED_BY]),
  }
}

export function transformMaintenance(record: RawRecord): MaintenanceRecord {
  const f = record.fields
  return {
    id: record.id,
    maintenanceId: str(f[MAINTENANCE.MAINTENANCE_ID]) ?? '',
    projects: strArr(f[MAINTENANCE.PROJECTS]),
    status: str(f[MAINTENANCE.STATUS]) ?? '',
    startDate: str(f[MAINTENANCE.START_DATE]) ?? '',
    endDate: str(f[MAINTENANCE.END_DATE]) ?? '',
    warrantyType: str(f[MAINTENANCE.WARRANTY_TYPE]),
  }
}
