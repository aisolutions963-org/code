import {
  CLIENTS,
  TASKS,
  TASK_TEMPLATES,
  PROJECTS,
  PROJECT_ITEMS,
  PAYMENTS,
  GATE_PASSES,
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
} from './fieldMap'
import { PHASE_CONFIG } from './phases'
import {
  Role,
  Task,
  TaskStatus,
  TaskUpdateInput,
  AttachmentInput,
  Attachment,
  Client,
  Project,
  ProjectCreateInput,
  Payment,
  PaymentCreateInput,
  GatePass,
  GatePassCreateInput,
  MaintenanceRecord,
  Announcement,
  AnnouncementCreateInput,
  Material,
  MaterialCreateInput,
  MaterialOrderInput,
  HandoverSheet,
  ProjectItem,
  Quotation,
  PurchaseOrder,
  PurchaseOrderCreateInput,
  InstallationLog,
  InstallationLogCreateInput,
  TimesheetEntry,
  CreateTimesheetInput,
  UpdateTimesheetInput,
  TimesheetFilters,
  WorkerOption,
  WeeklySummary,
  WorkerCreateInput,
  WorkerUpdateInput,
} from './types'
import { ROLE_TO_DEPARTMENT } from './permissions'
import { validateEnv } from './env'
import { recordAirtableFailure } from './metrics'
import { notifyTasksReady, createNotification, ROLE_DASHBOARD } from './notifications'

validateEnv()

const BASE_ID = process.env.AIRTABLE_BASE_ID!
const API_KEY = process.env.AIRTABLE_API_KEY!
const BASE_URL = 'https://api.airtable.com/v0'

function airtableHeaders() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  }
}

function recUrl(tableId: string, id: string): string {
  return `${BASE_URL}/${BASE_ID}/${tableId}/${id}?returnFieldsByFieldId=true`
}

function tblUrl(tableId: string): string {
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

async function fetchWithRetry(
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

function buildUrl(
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

interface RawRecord {
  id: string
  createdTime: string
  fields: Record<string, unknown>
}

async function fetchAll(
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

// ─── Transform helpers ───────────────────────────────────────────────────────

function str(val: unknown): string | undefined {
  return typeof val === 'string' ? val : undefined
}
function num(val: unknown): number | undefined {
  return typeof val === 'number' ? val : undefined
}
function bool(val: unknown): boolean | undefined {
  return typeof val === 'boolean' ? val : undefined
}
function strArr(val: unknown): string[] {
  return Array.isArray(val) ? (val as string[]) : []
}
function lookupStrArr(val: unknown): string[] {
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
function numArr(val: unknown): number[] {
  return Array.isArray(val) ? (val as number[]) : []
}
// Handles multipleLookupValues returning {valuesByLinkedRecordId: {recId: [n]}}
function lookupNumArr(val: unknown): number[] {
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
function boolArr(val: unknown): boolean[] {
  return Array.isArray(val) ? (val as boolean[]) : []
}
// Handles multipleLookupValues of a checkbox field
function lookupBoolArr(val: unknown): boolean[] {
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
function selectName(val: unknown): string | undefined {
  if (typeof val === 'string') return val
  if (val && typeof val === 'object') {
    const name = (val as { name?: string }).name
    if (typeof name === 'string') return name
  }
  return undefined
}
// Extracts the first linked record from a multipleRecordLinks field.
// Handles both string IDs (["recXXXX"]) and expanded objects ([{id, name, email}]).
function firstLinkedRecord(val: unknown): { id: string; name: string; email: string } | undefined {
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
function lookupSelectNames(val: unknown): string[] {
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
function parseDocLinks(val: unknown): import('./types').DocLink[] {
  if (!val || typeof val !== 'string') return []
  try {
    const parsed = JSON.parse(val)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (d): d is import('./types').DocLink =>
        d && typeof d.label === 'string',
    )
  } catch {
    return []
  }
}

function attachments(val: unknown): Attachment[] {
  if (!Array.isArray(val)) return []
  return (val as Record<string, unknown>[]).map((a) => ({
    id: a.id as string,
    url: a.url as string,
    filename: a.filename as string,
    size: a.size as number | undefined,
    type: (a.type ?? a.mimeType) as string | undefined,
  }))
}

function transformTask(record: RawRecord): Task {
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
    followUpOutcome: str(f[TASKS.FOLLOW_UP_OUTCOME]),
    pathCondition: selectName(f[TASKS.PATH_CONDITION]),
    taskDocLinks: parseDocLinks(f[TASKS.TASK_DOC_LINKS]),
    fillersDocLinks: parseDocLinks(f[TASKS.FILLERS_DOC_LINKS]),
  }
}

function transformProject(record: RawRecord): Project {
  const f = record.fields
  const owner = firstLinkedRecord(f[PROJECTS.SALES_OWNER])
  const rawCommun = f[PROJECTS.COMMUN_SEDS]
  const communRaw = Array.isArray(rawCommun)
    ? (rawCommun as Array<{ name?: string; email?: string; id?: string }>)
    : []
  const communSeds = communRaw.map((c) => c.name ?? c.email ?? c.id ?? '').filter(Boolean)
  const communSedIds = communRaw.map((c) => c.id ?? '').filter(Boolean)
  const quotationNumber = str(f[PROJECTS.QUOTATION_NUMBER])
  return {
    id: record.id,
    projectName: str(f[PROJECTS.PROJECT_NAME]) ?? '',
    nickname: str(f[PROJECTS.NICKNAME]),
    projectId: quotationNumber || str(f[PROJECTS.PROJECT_ID]) || '',
    quotationNumber: quotationNumber ?? undefined,
    quotationReference: str(f[PROJECTS.QUOTATION_REFERENCE]) ?? undefined,
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
    gatePassIds: strArr(f[PROJECTS.GATE_PASSES]),
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
  }
}

function transformPayment(record: RawRecord): Payment {
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

function transformGatePass(record: RawRecord): GatePass {
  const f = record.fields
  return {
    id: record.id,
    name: str(f[GATE_PASSES.NAME]) ?? '',
    project: strArr(f[GATE_PASSES.PROJECT]),
    itemsDescription: str(f[GATE_PASSES.ITEMS_DESCRIPTION]) ?? '',
    estimatedSupplyDate: str(f[GATE_PASSES.ESTIMATED_SUPPLY_DATE]) ?? '',
    confirmedDeliveryDate: str(f[GATE_PASSES.CONFIRMED_DELIVERY_DATE]),
    gatePassStatus: str(f[GATE_PASSES.GATE_PASS_STATUS]),
    siteReady: bool(f[GATE_PASSES.SITE_READY]),
    clientNotified: bool(f[GATE_PASSES.CLIENT_NOTIFIED]),
  }
}

function transformMaintenance(record: RawRecord): MaintenanceRecord {
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

// ─── Field ID → TaskUpdateInput key mapping ──────────────────────────────────

const TASK_FIELD_TO_ID: Record<keyof TaskUpdateInput, string> = {
  status: TASKS.STATUS,
  managerReviewStatus: TASKS.MANAGER_REVIEW_STATUS,
  managerComment: TASKS.MANAGER_COMMENT,
  postVisitOutcome: TASKS.POST_VISIT_OUTCOME,
  taskStartDate: TASKS.TASK_START_DATE,
  completionDate: TASKS.COMPLETION_DATE,
  startedAt: TASKS.STARTED_AT,
  completedAt: TASKS.COMPLETED_AT,
  teamDaysRequired: TASKS.TEAM_DAYS_REQUIRED,
  noOfLaborsPerDay: TASKS.NO_OF_LABORS_PER_DAY,
  installationDays: TASKS.INSTALLATION_DAYS,
  plannedProdStartDate: TASKS.PLANNED_PROD_START_DATE,
  expectedFabEndDate: TASKS.EXPECTED_FAB_END_DATE,
  fabricationPath: TASKS.FABRICATION_PATH,
  postCarpentryPath: TASKS.POST_CARPENTRY_PATH,
  productionStartPath: TASKS.PRODUCTION_START_PATH,
  conceptDesignApproval: TASKS.CONCEPT_DESIGN_APPROVAL,
  sampleApproval: TASKS.SAMPLE_APPROVAL,
  quotationOutcome: TASKS.QUOTATION_OUTCOME,
  qcCheckAtSiteDone: TASKS.QC_CHECK_AT_SITE_DONE,
  fillersDone: TASKS.FILLERS_DONE,
  taskDocuments: TASKS.TASK_DOCUMENTS,
  fillersAndMissingList: TASKS.FILLERS_MISSING_ITEMS_LIST,
  requiresManagerReviewManually: TASKS.REQUIRES_MANAGER_REVIEW_MANUALLY,
  priorityFlag: TASKS.PRIORITY_FLAG,
  callCount: TASKS.CALL_COUNT,
  sedNote: TASKS.SED_NOTE,
  followUpOutcome: TASKS.FOLLOW_UP_OUTCOME,
  taskDocLinks: TASKS.TASK_DOC_LINKS,
  fillersDocLinks: TASKS.FILLERS_DOC_LINKS,
}

const DOC_LINK_KEYS = new Set(['taskDocLinks', 'fillersDocLinks'])

function toAirtableFields(input: Partial<TaskUpdateInput>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    const fieldId = TASK_FIELD_TO_ID[key as keyof TaskUpdateInput]
    if (!fieldId) continue
    result[fieldId] = DOC_LINK_KEYS.has(key) ? JSON.stringify(value ?? []) : value
  }
  return result
}

// ─── Public API ──────────────────────────────────────────────────────────────

function buildDepartmentFormula(role: Role): string {
  if (role === 'superadmin') {
    return `{${TASKS.STATUS}} != "Locked"`
  }
  const departments = ROLE_TO_DEPARTMENT[role as Exclude<Role, 'superadmin'>]
  const deptChecks = departments
    .map((d) => `FIND("${d}", ARRAYJOIN({${TASKS.DEPARTMENT}}, ","))`)
    .join(', ')
  const deptOr = departments.length > 1 ? `OR(${deptChecks})` : deptChecks

  return `AND(${deptOr}, NOT(FIND("Superadmin", ARRAYJOIN({${TASKS.DEPARTMENT}}, ","))), {${TASKS.STATUS}} != "Locked")`
}

// Returns the Airtable record IDs of all projects owned/communed by a specific SED.
// Uses a minimal field fetch (3 fields) for performance.
export async function getSedProjectIds(opts: {
  sedAirtableMemberId?: string
  sedEmail?: string
}): Promise<string[]> {
  if (!opts.sedAirtableMemberId && !opts.sedEmail) return []
  const records = await fetchAll(PROJECTS.TABLE_ID, {
    fields: [PROJECTS.SALES_OWNER, PROJECTS.COMMUN_SEDS],
  })
  const memberId = opts.sedAirtableMemberId
  const email = opts.sedEmail?.toLowerCase()
  return records
    .filter((r) => {
      const owner = firstLinkedRecord(r.fields[PROJECTS.SALES_OWNER])
      const rawCommun = r.fields[PROJECTS.COMMUN_SEDS]
      const communIds: string[] = Array.isArray(rawCommun)
        ? (rawCommun as Array<{ id?: string }>).map((c) => c.id ?? '').filter(Boolean)
        : []
      if (memberId) {
        if (owner?.id === memberId) return true
        if (communIds.includes(memberId)) return true
      }
      if (email && owner?.email?.toLowerCase() === email) return true
      return false
    })
    .map((r) => r.id)
}

export async function getTasksByRole(
  role: Role,
  options: { projectId?: string; sedProjectIds?: string[] } = {},
): Promise<Task[]> {
  // SED with no assigned projects → no tasks
  if (options.sedProjectIds !== undefined && options.sedProjectIds.length === 0) return []

  let formula = buildDepartmentFormula(role)
  if (options.projectId) {
    formula = `AND(${formula}, {${TASKS.PROJECT}} = "${options.projectId}")`
  } else if (options.sedProjectIds && options.sedProjectIds.length > 0) {
    const projectFilter = options.sedProjectIds.length === 1
      ? `{${TASKS.PROJECT}} = "${options.sedProjectIds[0]}"`
      : `OR(${options.sedProjectIds.map((id) => `{${TASKS.PROJECT}} = "${id}"`).join(', ')})`
    formula = `AND(${formula}, ${projectFilter})`
  }
  const records = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: formula,
    sort: [
      { field: TASKS.PRIORITY_FLAG, direction: 'desc' },
      { field: TASKS.TEMPLATE_ORDER, direction: 'asc' },
    ],
  })
  let tasks = records.map(transformTask)
  tasks = await enrichTasksWithClientPhone(tasks)
  tasks = await enrichTasksWithProjectItemNames(tasks)
  tasks = await enrichTasksWithAssigneeNames(tasks)
  tasks = await enrichTasksWithProjectRef(tasks)
  tasks = await filterStalePhase1Tasks(tasks)
  return tasks
}

export async function getTaskById(id: string): Promise<Task> {
  const res = await fetchWithRetry(recUrl(TASKS.TABLE_ID, id), {
    headers: airtableHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformTask(record)
}

export async function updateTask(
  id: string,
  fields: Partial<TaskUpdateInput>,
): Promise<Task> {
  const airtableFields = toAirtableFields(fields)
  const res = await fetchWithRetry(recUrl(TASKS.TABLE_ID, id), {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields: airtableFields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformTask(record)
}

export async function updateTaskRaw(
  id: string,
  airtableFields: Record<string, unknown>,
): Promise<Task> {
  const res = await fetchWithRetry(recUrl(TASKS.TABLE_ID, id), {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields: airtableFields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformTask(record)
}

export async function getLockedTasksForScope(
  projectId: string,
  itemId?: string,
): Promise<Task[]> {
  // PROJECT is a singleLineText field storing the project Airtable record ID
  const projectFilter = `{${TASKS.PROJECT}} = "${projectId}"`
  const formula = itemId
    ? `AND(${projectFilter}, {${TASKS.STATUS}}="Locked")`
    : `AND(${projectFilter}, {${TASKS.STATUS}}="Locked", {${TASKS.PROJECT_ITEM}}=BLANK())`
  const records = await fetchAll(TASKS.TABLE_ID, { filterByFormula: formula })
  const tasks = records.map(transformTask)
  // For item scope, post-filter in JS since project item linked field isn't filterable by record ID
  return itemId ? tasks.filter((t) => t.projectItem?.[0] === itemId) : tasks
}

async function getFabricationActiveProjectIds(): Promise<Set<string>> {
  const fabTasks = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: `AND(FIND("Fabrication", ARRAYJOIN({${TASKS.DEPARTMENT}}, ",")), NOT({${TASKS.STATUS}} = "Locked"), NOT({${TASKS.STATUS}} = "Completed"))`,
    fields: [TASKS.PROJECT],
  })
  const ids = new Set<string>()
  for (const r of fabTasks) {
    for (const pid of strArr(r.fields[TASKS.PROJECT])) {
      ids.add(pid)
    }
  }
  return ids
}

export async function getProjects(options: { stage?: string; sedEmail?: string; sedAirtableMemberId?: string } = {}): Promise<Project[]> {
  let formula = `NOT(OR({${PROJECTS.PROJECT_STAGE}}="Closed", {${PROJECTS.PROJECT_STAGE}}="Archived"))`
  if (options.stage) {
    formula = `{${PROJECTS.PROJECT_STAGE}}="${options.stage}"`
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
        if (p.communSeds?.some(s => s.toLowerCase() === email)) return true
      }
      return false
    })
  }
  return projects
}

export async function getAllProjects(): Promise<Project[]> {
  const [records, fabActiveIds] = await Promise.all([
    fetchAll(PROJECTS.TABLE_ID, {
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
    projectCount,
  }
}

export async function getAllClients(): Promise<(Client & { projectCount: number })[]> {
  const records = await fetchAll(CLIENTS.TABLE_ID, {
    fields: [CLIENTS.CLIENT_NAME, CLIENTS.PHONE, CLIENTS.EMAIL, CLIENTS.CLIENT_ID, CLIENTS.PROJECTS],
    sort: [{ field: CLIENTS.CLIENT_NAME, direction: 'asc' }],
  })
  return records.map(transformClient)
}

async function findClientByName(name: string): Promise<Client | null> {
  const safe = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const formula = `LOWER({${CLIENTS.CLIENT_NAME}}) = LOWER("${safe}")`
  const records = await fetchAll(CLIENTS.TABLE_ID, {
    filterByFormula: formula,
    fields: [CLIENTS.CLIENT_NAME, CLIENTS.PHONE, CLIENTS.EMAIL, CLIENTS.CLIENT_ID],
    maxRecords: 1,
  })
  if (records.length === 0) return null
  return transformClient(records[0])
}

async function createClientRecord(name: string, phone?: string): Promise<Client> {
  const fields: Record<string, unknown> = { [CLIENTS.CLIENT_NAME]: name }
  if (phone) fields[CLIENTS.PHONE] = phone
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
  return transformClient(data.records[0])
}

async function getOrCreateClient(name: string, phone?: string): Promise<Client> {
  const existing = await findClientByName(name)
  if (existing) return existing
  return createClientRecord(name, phone)
}

export async function createProject(input: ProjectCreateInput): Promise<Project> {
  // Find or create the client record, then link it to the project
  const client = await getOrCreateClient(
    input.clientName,
    input.clientPhone || undefined,
  )

  const fields: Record<string, unknown> = {
    [PROJECTS.PROJECT_NAME]: input.projectName,
    [PROJECTS.NICKNAME]: input.nickname,
    [PROJECTS.CLIENT_NAME]: input.clientName,
    [PROJECTS.CLIENT]: [client.id],
    [PROJECTS.PROJECT_DESCRIPTION]: input.projectDescription,
    [PROJECTS.DETAILED_LOCATION]: input.detailedLocation,
    [PROJECTS.PAYMENT_MODE]: input.paymentMode,

    [PROJECTS.PROJECT_STAGE]: 'Preparing',
  }
  if (input.clientPhone) fields[PROJECTS.CLIENT_PHONE] = input.clientPhone
  if (input.emirate) fields[PROJECTS.EMIRATE] = input.emirate
  if (input.location) fields[PROJECTS.LOCATION] = input.location
  if (input.sedNotes) fields[PROJECTS.SED_NOTES] = input.sedNotes
  if (input.salesOwnerCollaboratorId) {
    fields[PROJECTS.SALES_OWNER] = [input.salesOwnerCollaboratorId]
  }
  if (input.communSedIds?.length) {
    fields[PROJECTS.COMMUN_SEDS] = input.communSedIds
  }

  const res = await fetchWithRetry(tblUrl(PROJECTS.TABLE_ID), {
    method: 'POST',
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

export async function getPaymentsByProject(projectId: string): Promise<Payment[]> {
  const formula = `FIND("${projectId}", ARRAYJOIN({${PAYMENTS.PROJECT}}, ","))`
  const records = await fetchAll(PAYMENTS.TABLE_ID, { filterByFormula: formula })
  return records.map(transformPayment)
}

export async function createPayment(input: PaymentCreateInput): Promise<Payment> {
  const fields: Record<string, unknown> = {
    [PAYMENTS.PROJECT]: input.project,
    [PAYMENTS.AMOUNT]: input.amount,
    [PAYMENTS.PAYMENT_TYPE]: input.paymentType,
    [PAYMENTS.PAYMENT_STATUS]: input.paymentStatus,
    [PAYMENTS.PAYMENT_METHOD]: input.paymentMethod,
  }
  if (input.referenceNo) fields[PAYMENTS.REFERENCE_NO] = input.referenceNo
  if (input.receivedDate) fields[PAYMENTS.RECEIVED_DATE] = input.receivedDate
  if (input.dueDate) fields[PAYMENTS.DUE_DATE] = input.dueDate
  if (input.stageAtPayment) fields[PAYMENTS.STAGE_AT_PAYMENT] = input.stageAtPayment
  if (input.payerType) fields[PAYMENTS.PAYER_TYPE] = input.payerType
  if (input.payerName) fields[PAYMENTS.PAYER_NAME] = input.payerName
  if (input.commissionAmount != null) fields[PAYMENTS.COMMISSION_AMOUNT] = input.commissionAmount
  if (input.notes) fields[PAYMENTS.NOTES] = input.notes
  if (input.recordedBy) fields[PAYMENTS.RECORDED_BY] = input.recordedBy

  const res = await fetchWithRetry(tblUrl(PAYMENTS.TABLE_ID), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformPayment(record)
}

export async function getGatePassesByProject(projectId: string): Promise<GatePass[]> {
  const formula = `FIND("${projectId}", ARRAYJOIN({${GATE_PASSES.PROJECT}}, ","))`
  const records = await fetchAll(GATE_PASSES.TABLE_ID, { filterByFormula: formula })
  return records.map(transformGatePass)
}

export async function getAllGatePasses(): Promise<GatePass[]> {
  const records = await fetchAll(GATE_PASSES.TABLE_ID, {
    sort: [{ field: GATE_PASSES.ESTIMATED_SUPPLY_DATE, direction: 'desc' }],
  })
  const gatePasses = records.map(transformGatePass)
  if (gatePasses.length === 0) return gatePasses

  const projectRecordIds = Array.from(new Set(gatePasses.flatMap((gp) => gp.project)))
  const nameMap: Record<string, { name: string; displayId: string }> = {}
  const chunks: string[][] = []
  for (let i = 0; i < projectRecordIds.length; i += 10) chunks.push(projectRecordIds.slice(i, i + 10))

  await Promise.all(chunks.map(async (chunk) => {
    const formula = `OR(${chunk.map((id) => `RECORD_ID()="${id}"`).join(',')})`
    const recs = await fetchAll(PROJECTS.TABLE_ID, {
      filterByFormula: formula,
      fields: [PROJECTS.PROJECT_NAME, PROJECTS.PROJECT_ID],
    })
    for (const r of recs) {
      nameMap[r.id] = {
        name: str(r.fields[PROJECTS.PROJECT_NAME]) ?? '',
        displayId: str(r.fields[PROJECTS.PROJECT_ID]) ?? '',
      }
    }
  }))

  return gatePasses.map((gp) => ({
    ...gp,
    projectName: gp.project[0] ? (nameMap[gp.project[0]]?.name ?? undefined) : undefined,
    projectDisplayId: gp.project[0] ? (nameMap[gp.project[0]]?.displayId ?? undefined) : undefined,
  }))
}

export async function createGatePass(input: GatePassCreateInput): Promise<GatePass> {
  const fields: Record<string, unknown> = {
    [GATE_PASSES.PROJECT]: input.project,
    [GATE_PASSES.ITEMS_DESCRIPTION]: input.itemsDescription,
    [GATE_PASSES.ESTIMATED_SUPPLY_DATE]: input.estimatedSupplyDate,
  }
  if (input.confirmedDeliveryDate) {
    fields[GATE_PASSES.CONFIRMED_DELIVERY_DATE] = input.confirmedDeliveryDate
  }
  const res = await fetchWithRetry(tblUrl(GATE_PASSES.TABLE_ID), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformGatePass(record)
}

export async function getMaintenanceRecords(): Promise<MaintenanceRecord[]> {
  const records = await fetchAll(MAINTENANCE.TABLE_ID, {
    sort: [{ field: MAINTENANCE.START_DATE, direction: 'desc' }],
  })
  return records.map(transformMaintenance)
}

export async function attachFileToTask(
  taskId: string,
  fieldId: string,
  url: string,
  filename: string,
): Promise<Task> {
  const task = await getTaskById(taskId)

  const attachmentFieldMap: Record<string, keyof Task> = {
    [TASKS.TASK_DOCUMENTS]: 'taskDocuments',
    [TASKS.FILLERS_MISSING_ITEMS_LIST]: 'fillersAndMissingList',
  }

  const taskKey = attachmentFieldMap[fieldId]
  const existing: Attachment[] = taskKey
    ? ((task[taskKey] as Attachment[]) ?? [])
    : []

  const preservedExisting = existing.map((a) => ({ id: a.id }))
  const newAttachment: AttachmentInput = { url, filename }

  const res = await fetchWithRetry(recUrl(TASKS.TABLE_ID, taskId), {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({
      fields: { [fieldId]: [...preservedExisting, newAttachment] },
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformTask(record)
}

export async function getTasksForProject(
  projectId: string,
  role: Role,
): Promise<Task[]> {
  return getTasksByRole(role, { projectId })
}

export async function getAllTasksForProject(projectId: string): Promise<Task[]> {
  const formula = `AND({${TASKS.PROJECT}} = "${projectId}", {${TASKS.STATUS}} != "Locked")`
  const records = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: formula,
    sort: [{ field: TASKS.TEMPLATE_ORDER, direction: 'asc' }],
  })
  let tasks = records.map(transformTask)
  tasks = await enrichTasksWithAssigneeNames(tasks)
  return tasks
}

export async function getIncompleteTasksForProject(projectId: string): Promise<Task[]> {
  const formula = `AND({${TASKS.PROJECT}} = "${projectId}", {${TASKS.STATUS}} != "Completed", {${TASKS.STATUS}} != "Locked")`
  const records = await fetchAll(TASKS.TABLE_ID, { filterByFormula: formula })
  return records.map(transformTask)
}

export async function getAllTasksForProjectAll(projectId: string, role?: Role): Promise<Task[]> {
  let formula = `{${TASKS.PROJECT}} = "${projectId}"`
  if (role && role !== 'superadmin') {
    const departments = ROLE_TO_DEPARTMENT[role]
    const deptChecks = departments
      .map((d) => `FIND("${d}", ARRAYJOIN({${TASKS.DEPARTMENT}}, ","))`)
      .join(', ')
    const deptOr = departments.length > 1 ? `OR(${deptChecks})` : deptChecks
    const deptFilter = `AND(${deptOr}, NOT(FIND("Superadmin", ARRAYJOIN({${TASKS.DEPARTMENT}}, ","))))`
    formula = `AND(${formula}, OR(${deptFilter}, {${TASKS.DEPARTMENT}} = BLANK()))`
  }
  const records = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: formula,
    sort: [{ field: TASKS.TEMPLATE_ORDER, direction: 'asc' }],
  })
  return records.map(transformTask)
}

export async function getLockedBranchTasksForProject(projectId: string): Promise<Task[]> {
  // Query locked tasks with "Sample Branch:" in the name, filter by project in code.
  // Avoids relying on the lookup-field formula which can silently return 0 results.
  const formula = `AND({${TASKS.STATUS}} = "Locked", FIND("Sample Branch:", {${TASKS.TASK_NAME}}) > 0)`
  const records = await fetchAll(TASKS.TABLE_ID, { filterByFormula: formula })
  const tasks = records.map(transformTask)
  return tasks.filter(
    (t) => t.projectRecordId === projectId || t.project?.[0] === projectId,
  )
}

export async function checkAndUnlockCallClientTask(projectId: string): Promise<void> {
  // Gate check only passes after at least one path task is completed — prevents bypassing
  // all approval gates without doing any actual work on a path.
  const pathDoneFormula = `AND({${TASKS.PROJECT}} = "${projectId}", NOT({${TASKS.PATH_CONDITION}} = BLANK()), {${TASKS.STATUS}} = "Completed")`
  const pathDoneRecords = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: pathDoneFormula,
    fields: [TASKS.STATUS],
  })
  if (pathDoneRecords.length === 0) return

  // Fetch all [GATE] tasks for this project and check their approval fields
  const gateFormula = `AND({${TASKS.PROJECT}} = "${projectId}", FIND("[GATE]", {${TASKS.TASK_NAME}}) > 0)`
  const gateRecords = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: gateFormula,
    fields: [TASKS.CONCEPT_DESIGN_APPROVAL, TASKS.SAMPLE_APPROVAL, TASKS.QUOTATION_OUTCOME],
  })

  let conceptApproved = false
  let sampleApproved = false
  let quotationApproved = false
  for (const r of gateRecords) {
    if (str(r.fields[TASKS.CONCEPT_DESIGN_APPROVAL]) === 'Approved') conceptApproved = true
    if (str(r.fields[TASKS.SAMPLE_APPROVAL]) === 'Approved') sampleApproved = true
    if (str(r.fields[TASKS.QUOTATION_OUTCOME]) === 'Approved') quotationApproved = true
  }

  if (!conceptApproved || !sampleApproved || !quotationApproved) return

  // All 3 cleared — unlock the locked "Call the Client" task for this project
  const callFormula = `AND({${TASKS.PROJECT}} = "${projectId}", FIND("Call the Client", {${TASKS.TASK_NAME}}) > 0, {${TASKS.STATUS}} = "Locked")`
  const callRecords = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: callFormula,
    fields: [TASKS.TASK_NAME, TASKS.DEPARTMENT, TASKS.PROJECT_ID],
  })

  if (callRecords.length === 0) return

  await Promise.all(
    callRecords.map((r) => updateTaskRaw(r.id, { [TASKS.STATUS]: 'To Do' })),
  )

  // Notify responsible departments that the Call the Client task is now actionable
  for (const r of callRecords) {
    const rawDepts = r.fields[TASKS.DEPARTMENT]
    const depts: string[] = Array.isArray(rawDepts)
      ? (rawDepts as Array<{ name?: string } | string>).map((d) =>
          typeof d === 'string' ? d : (d.name ?? ''),
        ).filter(Boolean)
      : []
    const taskName = str(r.fields[TASKS.TASK_NAME]) ?? 'Call the Client'
    const projRef = str(r.fields[TASKS.PROJECT_ID]) ?? projectId
    notifyTasksReady(
      [{ taskName, departments: depts.length > 0 ? depts : ['Manager'] }],
      `All approval gates cleared for project ${projRef} — ready to call the client`,
    )
  }

}

export async function checkAndUnlockInactivityFollowUp(
  projectId: string,
): Promise<boolean> {
  const formula = `AND({${TASKS.PROJECT}} = "${projectId}", {${TASKS.TASK_NAME}} = "Follow Up", {${TASKS.STATUS}} = "Locked")`
  const records = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: formula,
    fields: [TASKS.TASK_NAME],
  })
  if (records.length === 0) return false
  await Promise.all(records.map((r) => updateTaskRaw(r.id, { [TASKS.STATUS]: 'To Do' as TaskStatus })))
  return true
}

export async function getCallClientPendingTasks(): Promise<
  { taskId: string; projectRef: string; projectName: string; clientName: string; clientPhone: string }[]
> {
  const formula = `AND(FIND("Call the Client", {${TASKS.TASK_NAME}}) > 0, {${TASKS.STATUS}} = "To Do")`
  const taskRecords = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: formula,
    fields: [TASKS.TASK_NAME, TASKS.PROJECT],
  })
  if (taskRecords.length === 0) return []

  const projectIds = Array.from(
    new Set(taskRecords.flatMap((r) => strArr(r.fields[TASKS.PROJECT]))),
  )
  const chunks: string[][] = []
  for (let i = 0; i < projectIds.length; i += 10) chunks.push(projectIds.slice(i, i + 10))

  const projectMap: Record<string, { projectId: string; projectName: string; clientName: string; clientPhone: string }> = {}
  await Promise.all(
    chunks.map(async (chunk) => {
      const f = `OR(${chunk.map((id) => `RECORD_ID()="${id}"`).join(',')})`
      const projects = await fetchAll(PROJECTS.TABLE_ID, {
        filterByFormula: f,
        fields: [PROJECTS.PROJECT_ID, PROJECTS.PROJECT_NAME, PROJECTS.CLIENT_NAME, PROJECTS.CLIENT_PHONE],
      })
      for (const p of projects) {
        projectMap[p.id] = {
          projectId: str(p.fields[PROJECTS.PROJECT_ID]) ?? '',
          projectName: str(p.fields[PROJECTS.PROJECT_NAME]) ?? '',
          clientName: str(p.fields[PROJECTS.CLIENT_NAME]) ?? '',
          clientPhone: str(p.fields[PROJECTS.CLIENT_PHONE]) ?? '',
        }
      }
    }),
  )

  return taskRecords.map((r) => {
    const pid = strArr(r.fields[TASKS.PROJECT])[0] ?? ''
    const proj = projectMap[pid] ?? { projectId: '', projectName: '', clientName: '', clientPhone: '' }
    return {
      taskId: r.id,
      projectRef: proj.projectId,
      projectName: proj.projectName,
      clientName: proj.clientName,
      clientPhone: proj.clientPhone,
    }
  })
}

export async function getPendingApprovalsCount(): Promise<number> {
  const formula = `{${TASKS.MANAGER_REVIEW_STATUS}} = "Pending"`
  const records = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: formula,
    fields: [TASKS.MANAGER_REVIEW_STATUS],
  })
  return records.length
}

// Maps internal SQL role names to Airtable System Role singleSelect values
const AIRTABLE_ROLE_MAP: Record<string, string> = {
  superadmin: 'Superadmin',
  manager: 'Manager',
  sed: 'SED',
  fabrication: 'Fabrication',
  installation: 'Installation',
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

export interface TeamMember {
  id: string
  name: string
  role: string
  active: boolean
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
): Promise<Project> {
  const project = await updateProject(projectId, {
    [PROJECTS.INSTALLATION_TEAM_MEMBERS]: teamMemberIds,
  })
  const projectRef = project.nickname ?? project.projectName ?? project.projectId
  const body = opts?.itemName ? `${projectRef} — ${opts.itemName}` : projectRef
  createNotification({
    recipientRole: 'installation',
    title: 'Installation team assigned',
    body,
    link: ROLE_DASHBOARD['installation'],
  })
  return project
}

async function enrichTasksWithProjectItemNames(tasks: Task[]): Promise<Task[]> {
  const itemIds = Array.from(new Set(tasks.flatMap((t) => t.projectItem ?? [])))
  if (itemIds.length === 0) return tasks
  const nameMap = await getProjectItemNameMap(itemIds)
  return tasks.map((t) => {
    const itemId = t.projectItem?.[0]
    if (!itemId || !nameMap[itemId]) return t
    return { ...t, projectItemName: nameMap[itemId] }
  })
}

export async function getProjectItemNameMap(itemIds: string[]): Promise<Record<string, string>> {
  if (itemIds.length === 0) return {}
  const unique = Array.from(new Set(itemIds))
  const chunks: string[][] = []
  for (let i = 0; i < unique.length; i += 10) {
    chunks.push(unique.slice(i, i + 10))
  }
  const nameMap: Record<string, string> = {}
  await Promise.all(
    chunks.map(async (chunk) => {
      const formula = `OR(${chunk.map((id) => `RECORD_ID()="${id}"`).join(',')})`
      const records = await fetchAll(PROJECT_ITEMS.TABLE_ID, {
        filterByFormula: formula,
        fields: [PROJECT_ITEMS.ITEM_NAME, PROJECT_ITEMS.ITEM_ID],
      })
      for (const r of records) {
        nameMap[r.id] = (str(r.fields[PROJECT_ITEMS.ITEM_NAME]) ?? str(r.fields[PROJECT_ITEMS.ITEM_ID]) ?? r.id)
      }
    }),
  )
  return nameMap
}

const CLIENT_CONTACT_KEYWORDS = [
  'notify client',
  'contact client',
  'call client',
  'client visit',
  'client approval',
  'client sign',
  'client confirmation',
]

function hasClientContactKeyword(taskName: string): boolean {
  const lower = taskName.toLowerCase()
  return CLIENT_CONTACT_KEYWORDS.some((kw) => lower.includes(kw))
}

async function enrichTasksWithClientPhone(tasks: Task[]): Promise<Task[]> {
  const contactTasks = tasks.filter((t) => hasClientContactKeyword(t.taskName))
  if (contactTasks.length === 0) return tasks

  const projectIds = Array.from(new Set(contactTasks.flatMap((t) => t.project ?? [])))
  if (projectIds.length === 0) return tasks

  const chunks: string[][] = []
  for (let i = 0; i < projectIds.length; i += 10) {
    chunks.push(projectIds.slice(i, i + 10))
  }

  const phoneMap: Record<string, string> = {}
  await Promise.all(
    chunks.map(async (chunk) => {
      const formula = `OR(${chunk.map((id) => `RECORD_ID()="${id}"`).join(',')})`
      const records = await fetchAll(PROJECTS.TABLE_ID, {
        filterByFormula: formula,
        fields: [PROJECTS.CLIENT_PHONE],
      })
      for (const r of records) {
        const phone = str(r.fields[PROJECTS.CLIENT_PHONE])
        if (phone) phoneMap[r.id] = phone
      }
    }),
  )

  return tasks.map((t) => {
    if (!hasClientContactKeyword(t.taskName)) return t
    const projectId = t.project?.[0]
    const phone = projectId ? phoneMap[projectId] : undefined
    return phone ? { ...t, clientPhone: phone } : t
  })
}

async function enrichTasksWithProjectRef(tasks: Task[]): Promise<Task[]> {
  const projectIds = Array.from(new Set(tasks.flatMap((t) => t.project ?? [])))
  if (projectIds.length === 0) return tasks

  const infoMap: Record<string, { ref: string; name: string; nickname: string | null; quotationNumber: string | null; quotationReference: string | null }> = {}
  const chunks: string[][] = []
  for (let i = 0; i < projectIds.length; i += 10) {
    chunks.push(projectIds.slice(i, i + 10))
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const formula = `OR(${chunk.map((id) => `RECORD_ID()="${id}"`).join(',')})`
      const records = await fetchAll(PROJECTS.TABLE_ID, {
        filterByFormula: formula,
        fields: [PROJECTS.PROJECT_ID, PROJECTS.PROJECT_NAME, PROJECTS.NICKNAME, PROJECTS.QUOTATION_NUMBER, PROJECTS.QUOTATION_REFERENCE],
      })
      for (const r of records) {
        const ref = str(r.fields[PROJECTS.PROJECT_ID])
        const name = str(r.fields[PROJECTS.PROJECT_NAME]) ?? ''
        const nickname = str(r.fields[PROJECTS.NICKNAME]) ?? null
        const quotationNumber = str(r.fields[PROJECTS.QUOTATION_NUMBER]) ?? null
        const quotationReference = str(r.fields[PROJECTS.QUOTATION_REFERENCE]) ?? null
        if (ref) infoMap[r.id] = { ref, name, nickname, quotationNumber, quotationReference }
      }
    }),
  )

  return tasks.map((t) => {
    const pid = t.project?.[0]
    if (!pid) return t
    const info = infoMap[pid]
    return {
      ...t,
      projectRecordId: pid,
      ...(info
        ? {
            projectRef: info.ref,
            projectName: info.name,
            projectNickname: info.nickname ?? undefined,
            projectQuotationNumber: info.quotationNumber ?? undefined,
            projectQuotationReference: info.quotationReference ?? undefined,
          }
        : {}),
    }
  })
}

async function filterStalePhase1Tasks(tasks: Task[]): Promise<Task[]> {
  const preparingMax = PHASE_CONFIG.Preparing.universalActionOrderMax
  const phase1Pending = tasks.filter((t) => {
    const order = t.templateOrder?.[0]
    return typeof order === 'number' && order <= preparingMax && t.status !== 'Completed'
  })
  if (phase1Pending.length === 0) return tasks

  const projectIds = Array.from(new Set(phase1Pending.flatMap((t) => t.project ?? [])))
  if (projectIds.length === 0) return tasks

  const stageMap: Record<string, string> = {}
  const chunks: string[][] = []
  for (let i = 0; i < projectIds.length; i += 10) chunks.push(projectIds.slice(i, i + 10))

  await Promise.all(
    chunks.map(async (chunk) => {
      const formula = `OR(${chunk.map((id) => `RECORD_ID()="${id}"`).join(',')})`
      const records = await fetchAll(PROJECTS.TABLE_ID, {
        filterByFormula: formula,
        fields: [PROJECTS.PROJECT_STAGE],
      })
      for (const r of records) {
        const stage = str(r.fields[PROJECTS.PROJECT_STAGE])
        if (stage) stageMap[r.id] = stage
      }
    }),
  )

  return tasks.filter((t) => {
    const order = t.templateOrder?.[0]
    if (typeof order !== 'number' || order > preparingMax) return true
    if (t.status === 'Completed') return true
    const projectId = t.project?.[0]
    if (!projectId) return true
    const stage = stageMap[projectId]
    return !stage || stage === 'Preparing'
  })
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
  const res = await fetchWithRetry(`${BASE_URL}/${BASE_ID}/${TEAM_MEMBERS.TABLE_ID}/${recordId}`, {
    method: 'DELETE',
    headers: airtableHeaders(),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
}

async function enrichTasksWithAssigneeNames(tasks: Task[]): Promise<Task[]> {
  const allIds = Array.from(new Set(tasks.flatMap((t) => t.assignedTo ?? [])))
  if (allIds.length === 0) return tasks

  const nameMap: Record<string, string> = {}
  const chunks: string[][] = []
  for (let i = 0; i < allIds.length; i += 10) {
    chunks.push(allIds.slice(i, i + 10))
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const formula = `OR(${chunk.map((id) => `RECORD_ID()="${id}"`).join(',')})`
      const records = await fetchAll(TEAM_MEMBERS.TABLE_ID, {
        filterByFormula: formula,
        fields: [TEAM_MEMBERS.NAME],
      })
      for (const r of records) {
        nameMap[r.id] = str(r.fields[TEAM_MEMBERS.NAME]) ?? ''
      }
    }),
  )

  return tasks.map((t) => {
    const id = t.assignedTo?.[0]
    if (!id || !nameMap[id]) return t
    return { ...t, assigneeName: nameMap[id] }
  })
}

// ─── Announcements ──────────────────────────────────────────────────────────

function transformAnnouncement(record: RawRecord): Announcement {
  const f = record.fields
  return {
    id: record.id,
    title: str(f[ANNOUNCEMENTS.TITLE]) ?? '',
    message: str(f[ANNOUNCEMENTS.MESSAGE]),
    pinned: bool(f[ANNOUNCEMENTS.PINNED]),
    visibleTo: str(f[ANNOUNCEMENTS.VISIBLE_TO]),
    expiresAt: str(f[ANNOUNCEMENTS.EXPIRES_AT]),
  }
}

const ROLE_TO_AUDIENCE: Record<string, string> = {
  installation: 'Installation',
  sed: 'SED',
  fabrication: 'Fabrication',
  manager: 'Manager',
  superadmin: 'Superadmin',
}

export async function getAnnouncements(role?: string): Promise<Announcement[]> {
  const today = new Date().toISOString().slice(0, 10)
  const expiryFilter = `OR(IS_AFTER({${ANNOUNCEMENTS.EXPIRES_AT}}, "${today}"), {${ANNOUNCEMENTS.EXPIRES_AT}}=BLANK())`

  let visibilityFilter: string
  if (!role || role === 'superadmin') {
    visibilityFilter = `OR({${ANNOUNCEMENTS.VISIBLE_TO}}="Everyone", {${ANNOUNCEMENTS.VISIBLE_TO}}="Superadmin", {${ANNOUNCEMENTS.VISIBLE_TO}}=BLANK())`
  } else {
    const audience = ROLE_TO_AUDIENCE[role]
    visibilityFilter = audience
      ? `OR({${ANNOUNCEMENTS.VISIBLE_TO}}="Everyone", {${ANNOUNCEMENTS.VISIBLE_TO}}=BLANK(), {${ANNOUNCEMENTS.VISIBLE_TO}}="${audience}")`
      : `OR({${ANNOUNCEMENTS.VISIBLE_TO}}="Everyone", {${ANNOUNCEMENTS.VISIBLE_TO}}=BLANK())`
  }

  const formula = `AND(${expiryFilter}, ${visibilityFilter})`
  const records = await fetchAll(ANNOUNCEMENTS.TABLE_ID, {
    filterByFormula: formula,
    sort: [{ field: ANNOUNCEMENTS.PINNED, direction: 'desc' }],
  })
  return records.map(transformAnnouncement)
}

export async function createAnnouncement(input: AnnouncementCreateInput): Promise<Announcement> {
  const fields: Record<string, unknown> = { [ANNOUNCEMENTS.TITLE]: input.title }
  if (input.message) fields[ANNOUNCEMENTS.MESSAGE] = input.message
  if (input.pinned !== undefined) fields[ANNOUNCEMENTS.PINNED] = input.pinned
  if (input.visibleTo) fields[ANNOUNCEMENTS.VISIBLE_TO] = input.visibleTo
  if (input.expiresAt) fields[ANNOUNCEMENTS.EXPIRES_AT] = input.expiresAt

  const res = await fetchWithRetry(tblUrl(ANNOUNCEMENTS.TABLE_ID), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformAnnouncement(record)
}

export async function updateAnnouncement(
  id: string,
  data: Partial<AnnouncementCreateInput>,
): Promise<Announcement> {
  const fields: Record<string, unknown> = {}
  if (data.title !== undefined) fields[ANNOUNCEMENTS.TITLE] = data.title
  if (data.message !== undefined) fields[ANNOUNCEMENTS.MESSAGE] = data.message
  if (data.pinned !== undefined) fields[ANNOUNCEMENTS.PINNED] = data.pinned
  if (data.visibleTo !== undefined) fields[ANNOUNCEMENTS.VISIBLE_TO] = data.visibleTo
  if (data.expiresAt !== undefined) fields[ANNOUNCEMENTS.EXPIRES_AT] = data.expiresAt

  const res = await fetchWithRetry(recUrl(ANNOUNCEMENTS.TABLE_ID, id), {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformAnnouncement(record)
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const res = await fetchWithRetry(`${BASE_URL}/${BASE_ID}/${ANNOUNCEMENTS.TABLE_ID}/${id}`, {
    method: 'DELETE',
    headers: airtableHeaders(),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
}

// ─── Materials ───────────────────────────────────────────────────────────────

function transformMaterial(record: RawRecord): Material {
  const f = record.fields
  return {
    id: record.id,
    name: str(f[MATERIALS_NEEDED.NAME]) ?? '',
    projects: strArr(f[MATERIALS_NEEDED.PROJECTS]),
    supplier: str(f[MATERIALS_NEEDED.SUPPLIER]),
    quantity: num(f[MATERIALS_NEEDED.QUANTITY]),
    unit: str(f[MATERIALS_NEEDED.UNIT]),
    unitCost: num(f[MATERIALS_NEEDED.UNIT_COST]),
    orderStatus: str(f[MATERIALS_NEEDED.ORDER_STATUS]),
    expectedArrivalDate: str(f[MATERIALS_NEEDED.EXPECTED_ARRIVAL_DATE]),
    actualArrivalDate: str(f[MATERIALS_NEEDED.ACTUAL_ARRIVAL_DATE]),
    notes: str(f[MATERIALS_NEEDED.NOTES]),
    purpose: str(f[MATERIALS_NEEDED.PURPOSE]),
    requestedBy: str(f[MATERIALS_NEEDED.REQUESTED_BY]),
    requestDate: str(f[MATERIALS_NEEDED.REQUEST_DATE]),
  }
}

export async function getMaterialsByProject(projectId: string): Promise<Material[]> {
  const formula = `{${MATERIALS_NEEDED.PROJECT_RECORD_ID}}="${projectId}"`
  const records = await fetchAll(MATERIALS_NEEDED.TABLE_ID, { filterByFormula: formula })
  return records.map(transformMaterial)
}

export async function updateMaterialOrderStatus(
  id: string,
  orderStatus: string,
): Promise<Material> {
  const res = await fetchWithRetry(recUrl(MATERIALS_NEEDED.TABLE_ID, id), {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields: { [MATERIALS_NEEDED.ORDER_STATUS]: orderStatus } }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformMaterial(record)
}

export async function createMaterials(
  projectId: string,
  items: MaterialCreateInput[],
): Promise<Material[]> {
  const created: Material[] = []
  for (let i = 0; i < items.length; i += 10) {
    const chunk = items.slice(i, i + 10)
    const res = await fetchWithRetry(tblUrl(MATERIALS_NEEDED.TABLE_ID), {
      method: 'POST',
      headers: airtableHeaders(),
      body: JSON.stringify({
        records: chunk.map((item) => {
          const fields: Record<string, unknown> = {
            [MATERIALS_NEEDED.NAME]: item.name,
            [MATERIALS_NEEDED.PROJECTS]: [projectId],
            [MATERIALS_NEEDED.PROJECT_RECORD_ID]: projectId,
          }
          if (item.supplier) fields[MATERIALS_NEEDED.SUPPLIER] = item.supplier
          if (item.quantity != null) fields[MATERIALS_NEEDED.QUANTITY] = item.quantity
          if (item.unit) fields[MATERIALS_NEEDED.UNIT] = item.unit
          if (item.unitCost != null) fields[MATERIALS_NEEDED.UNIT_COST] = item.unitCost
          if (item.expectedArrivalDate) fields[MATERIALS_NEEDED.EXPECTED_ARRIVAL_DATE] = item.expectedArrivalDate
          if (item.notes) fields[MATERIALS_NEEDED.NOTES] = item.notes
          return { fields }
        }),
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Airtable error ${res.status}: ${body}`)
    }
    const data = (await res.json()) as { records: RawRecord[] }
    created.push(...data.records.map(transformMaterial))
  }
  return created
}

export async function createMaterialOrder(order: MaterialOrderInput): Promise<Material[]> {
  const created: Material[] = []
  const today = order.requestDate
  for (let i = 0; i < order.items.length; i += 10) {
    const chunk = order.items.slice(i, i + 10)
    const res = await fetchWithRetry(tblUrl(MATERIALS_NEEDED.TABLE_ID), {
      method: 'POST',
      headers: airtableHeaders(),
      body: JSON.stringify({
        records: chunk.map((item) => {
          const fields: Record<string, unknown> = {
            [MATERIALS_NEEDED.NAME]: item.name,
            [MATERIALS_NEEDED.QUANTITY]: item.quantity,
            [MATERIALS_NEEDED.UNIT]: item.unit,
            [MATERIALS_NEEDED.PURPOSE]: order.purpose,
            [MATERIALS_NEEDED.REQUESTED_BY]: order.requestedBy,
            [MATERIALS_NEEDED.REQUEST_DATE]: today,
            [MATERIALS_NEEDED.ORDER_STATUS]: 'Not ordered',
          }
          if (order.projectId) {
            fields[MATERIALS_NEEDED.PROJECTS] = [order.projectId]
            fields[MATERIALS_NEEDED.PROJECT_RECORD_ID] = order.projectId
          }
          if (order.projectItemId) {
            fields[MATERIALS_NEEDED.PROJECT_ITEMS] = [order.projectItemId]
          }
          if (item.supplier) fields[MATERIALS_NEEDED.SUPPLIER] = item.supplier
          if (item.neededByDate) fields[MATERIALS_NEEDED.EXPECTED_ARRIVAL_DATE] = item.neededByDate
          if (item.notes) fields[MATERIALS_NEEDED.NOTES] = item.notes
          return { fields }
        }),
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Airtable error ${res.status}: ${body}`)
    }
    const data = (await res.json()) as { records: RawRecord[] }
    created.push(...data.records.map(transformMaterial))
  }
  return created
}

export async function deleteTasksByProjectId(projectId: string): Promise<number> {
  const formula = `{${TASKS.PROJECT}} = "${projectId}"`
  const records = await fetchAll(TASKS.TABLE_ID, { filterByFormula: formula, fields: [TASKS.STATUS] })
  if (records.length === 0) return 0

  let deleted = 0
  for (let i = 0; i < records.length; i += 10) {
    const chunk = records.slice(i, i + 10)
    const qs = chunk.map((r) => `records[]=${r.id}`).join('&')
    const res = await fetchWithRetry(`${BASE_URL}/${BASE_ID}/${TASKS.TABLE_ID}?${qs}`, {
      method: 'DELETE',
      headers: airtableHeaders(),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Airtable error deleting tasks ${res.status}: ${body}`)
    }
    deleted += chunk.length
  }
  return deleted
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
  return transformHandoverSheet(data2.records[0])
}

export async function getHandoverSheetForProject(projectId: string): Promise<HandoverSheet[]> {
  const records = await fetchAll(HANDOVER_SHEETS.TABLE_ID, {
    filterByFormula: `FIND("${projectId}", ARRAYJOIN({${HANDOVER_SHEETS.PROJECT}}, ","))`,
    sort: [{ field: HANDOVER_SHEETS.FINAL_INSTALLATION_DATE, direction: 'desc' }],
  })
  return records.map(transformHandoverSheet)
}

export async function createMaintenanceRecord(
  projectId: string,
  dates: { startDate: string; endDate: string },
): Promise<void> {
  const fields: Record<string, unknown> = {
    [MAINTENANCE.PROJECTS]: [projectId],
    [MAINTENANCE.STATUS]: 'Active',
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
}

export async function uploadAttachmentToRecord(
  recordId: string,
  fieldId: string,
  file: { name: string; type: string; buffer: Buffer },
): Promise<void> {
  const form = new FormData()
  form.append(
    'file',
    new Blob([new Uint8Array(file.buffer)], { type: file.type || 'application/octet-stream' }),
    file.name,
  )
  const res = await fetch(
    `https://content.airtable.com/v0/${BASE_ID}/${recordId}/uploadAttachment/${fieldId}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
      body: form,
    },
  )
  if (!res.ok) {
    throw new Error(`Airtable attachment upload failed: ${res.status} ${await res.text()}`)
  }
}

// ─── Purchase Orders ─────────────────────────────────────────────────────────

function transformPurchaseOrder(record: RawRecord): PurchaseOrder {
  const f = record.fields
  return {
    id: record.id,
    name: str(f[PURCHASE_ORDERS.NAME]) ?? '',
    project: strArr(f[PURCHASE_ORDERS.PROJECT]),
    supplier: str(f[PURCHASE_ORDERS.SUPPLIER]),
    totalAmount: num(f[PURCHASE_ORDERS.TOTAL_AMOUNT]),
    poStatus: str(f[PURCHASE_ORDERS.PO_STATUS]),
    orderDate: str(f[PURCHASE_ORDERS.ORDER_DATE]),
    expectedDelivery: str(f[PURCHASE_ORDERS.EXPECTED_DELIVERY]),
    actualDelivery: str(f[PURCHASE_ORDERS.ACTUAL_DELIVERY]),
    managerApproved: bool(f[PURCHASE_ORDERS.MANAGER_APPROVED]),
    notes: str(f[PURCHASE_ORDERS.NOTES]),
    recordedBy: str(f[PURCHASE_ORDERS.RECORDED_BY]),
  }
}

export async function getPurchaseOrdersByProject(projectId: string): Promise<PurchaseOrder[]> {
  const formula = `FIND("${projectId}", ARRAYJOIN({${PURCHASE_ORDERS.PROJECT}}, ","))`
  const records = await fetchAll(PURCHASE_ORDERS.TABLE_ID, {
    filterByFormula: formula,
    sort: [{ field: PURCHASE_ORDERS.ORDER_DATE, direction: 'desc' }],
  })
  return records.map(transformPurchaseOrder)
}

export async function createPurchaseOrder(input: PurchaseOrderCreateInput): Promise<PurchaseOrder> {
  const fields: Record<string, unknown> = {
    [PURCHASE_ORDERS.PROJECT]: input.project,
    [PURCHASE_ORDERS.SUPPLIER]: input.supplier,
    [PURCHASE_ORDERS.PO_STATUS]: 'Draft',
  }
  if (input.totalAmount != null) fields[PURCHASE_ORDERS.TOTAL_AMOUNT] = input.totalAmount
  if (input.orderDate) fields[PURCHASE_ORDERS.ORDER_DATE] = input.orderDate
  if (input.expectedDelivery) fields[PURCHASE_ORDERS.EXPECTED_DELIVERY] = input.expectedDelivery
  if (input.notes) fields[PURCHASE_ORDERS.NOTES] = input.notes
  if (input.recordedBy) fields[PURCHASE_ORDERS.RECORDED_BY] = input.recordedBy
  const res = await fetchWithRetry(tblUrl(PURCHASE_ORDERS.TABLE_ID), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformPurchaseOrder(record)
}

// ─── Installation Logs ────────────────────────────────────────────────────────

function transformInstallationLog(record: RawRecord): InstallationLog {
  const f = record.fields
  return {
    id: record.id,
    name: str(f[INSTALLATION_LOGS.NAME]) ?? '',
    project: strArr(f[INSTALLATION_LOGS.PROJECT]),
    date: str(f[INSTALLATION_LOGS.DATE]) ?? '',
    installationTeam: str(f[INSTALLATION_LOGS.INSTALLATION_TEAM]),
    numberOfLaborers: num(f[INSTALLATION_LOGS.NUMBER_OF_LABORERS]),
    workDescription: str(f[INSTALLATION_LOGS.WORK_DESCRIPTION]),
    expectedFinishDate: str(f[INSTALLATION_LOGS.EXPECTED_FINISH_DATE]),
    recordedBy: str(f[INSTALLATION_LOGS.RECORDED_BY]),
  }
}

export async function getInstallationLogsByProject(projectId: string): Promise<InstallationLog[]> {
  const formula = `FIND("${projectId}", ARRAYJOIN({${INSTALLATION_LOGS.PROJECT}}, ","))`
  const records = await fetchAll(INSTALLATION_LOGS.TABLE_ID, {
    filterByFormula: formula,
    sort: [{ field: INSTALLATION_LOGS.DATE, direction: 'desc' }],
  })
  return records.map(transformInstallationLog)
}

export async function createInstallationLog(input: InstallationLogCreateInput): Promise<InstallationLog> {
  const fields: Record<string, unknown> = {
    [INSTALLATION_LOGS.PROJECT]: input.project,
    [INSTALLATION_LOGS.DATE]: input.date,
  }
  if (input.installationTeam) fields[INSTALLATION_LOGS.INSTALLATION_TEAM] = input.installationTeam
  if (input.numberOfLaborers != null) fields[INSTALLATION_LOGS.NUMBER_OF_LABORERS] = input.numberOfLaborers
  if (input.workDescription) fields[INSTALLATION_LOGS.WORK_DESCRIPTION] = input.workDescription
  if (input.expectedFinishDate) fields[INSTALLATION_LOGS.EXPECTED_FINISH_DATE] = input.expectedFinishDate
  if (input.recordedBy) fields[INSTALLATION_LOGS.RECORDED_BY] = input.recordedBy
  const res = await fetchWithRetry(tblUrl(INSTALLATION_LOGS.TABLE_ID), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformInstallationLog(record)
}

// ─── Calendar data ───────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string
  title: string
  date: string
  endDate?: string
  type: 'installation' | 'delivery' | 'activity' | 'payment-due' | 'payment-received' | 'fabrication'
  projectId?: string
  projectName?: string
  itemName?: string
  amount?: number
  notes?: string
  customTask?: string
  createdBy?: string
  createdAt?: string
}

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  const [gatePasses, tasks, fabTasks, payments, customEvents, installationLogs, allProjects] = await Promise.all([
    fetchAll(GATE_PASSES.TABLE_ID, {
      filterByFormula: `NOT({${GATE_PASSES.ESTIMATED_SUPPLY_DATE}}=BLANK())`,
      fields: [GATE_PASSES.NAME, GATE_PASSES.ESTIMATED_SUPPLY_DATE, GATE_PASSES.CONFIRMED_DELIVERY_DATE, GATE_PASSES.PROJECT],
      sort: [{ field: GATE_PASSES.ESTIMATED_SUPPLY_DATE, direction: 'asc' }],
    }),
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

  // Build project lookup: Airtable record ID → display name
  const projectNameMap = new Map<string, string>()
  for (const p of allProjects) {
    const label = str(p.fields[PROJECTS.NICKNAME]) ?? str(p.fields[PROJECTS.PROJECT_NAME]) ?? str(p.fields[PROJECTS.PROJECT_ID])
    if (label) projectNameMap.set(p.id, label)
  }

  const getProjectName = (linkedIds: unknown): string | undefined => {
    const ids = linkedIds as string[] | undefined
    return ids?.[0] ? projectNameMap.get(ids[0]) : undefined
  }

  const events: CalendarEvent[] = []

  for (const r of gatePasses) {
    const f = r.fields
    const date = str(f[GATE_PASSES.CONFIRMED_DELIVERY_DATE]) ?? str(f[GATE_PASSES.ESTIMATED_SUPPLY_DATE])
    if (date) {
      events.push({
        id: r.id,
        title: str(f[GATE_PASSES.NAME]) ?? 'Delivery',
        date,
        type: 'delivery',
        projectName: getProjectName(f[GATE_PASSES.PROJECT]),
        createdAt: r.createdTime,
      })
    }
  }

  for (const r of tasks) {
    const f = r.fields
    const date = str(f[TASKS.TASK_START_DATE]) ?? str(f[TASKS.COMPLETION_DATE])
    const dept = strArr(f[TASKS.DEPARTMENT])
    if (!date) continue
    const type: CalendarEvent['type'] = dept.includes('Installation') ? 'installation' : 'activity'
    events.push({
      id: r.id,
      title: str(f[TASKS.TASK_NAME]) ?? 'Task',
      date,
      type,
      projectId: str(f[TASKS.PROJECT_ID]),
      projectName: getProjectName(f[TASKS.PROJECT]),
      createdAt: r.createdTime,
    })
  }

  // Batch-resolve item names for fabrication tasks
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
    const createdBy = str(f[PAYMENTS.RECORDED_BY])
    if (receivedDate) {
      events.push({ id: `${r.id}-rcv`, title: name, date: receivedDate, type: 'payment-received', amount, projectName, createdBy, createdAt: r.createdTime })
    }
    if (dueDate && dueDate !== receivedDate) {
      events.push({ id: `${r.id}-due`, title: name, date: dueDate, type: 'payment-due', amount, projectName, createdBy, createdAt: r.createdTime })
    }
  }

  for (const r of customEvents) {
    const f = r.fields
    const date = str(f[CALENDAR_EVENTS.DATE])
    const title = str(f[CALENDAR_EVENTS.TITLE])
    if (!date || !title) continue
    const customTask = str(f[CALENDAR_EVENTS.CUSTOM_TASK])
    events.push({
      id: r.id,
      title,
      date,
      type: customTask?.startsWith('f2:') ? 'delivery' : 'activity',
      notes: str(f[CALENDAR_EVENTS.NOTES]),
      customTask,
      createdBy: str(f[CALENDAR_EVENTS.CREATED_BY]),
      projectName: getProjectName(f[CALENDAR_EVENTS.PROJECT]),
      createdAt: r.createdTime,
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
      createdAt: r.createdTime,
    })
  }

  return events
}

export async function createAdHocTask(fields: {
  taskName: string
  projectId: string
  departments: string[]
  status?: string
}): Promise<string> {
  const record: Record<string, unknown> = {
    [TASKS.TASK_NAME]: fields.taskName,
    [TASKS.PROJECT]: fields.projectId,
    [TASKS.STATUS]: fields.status ?? 'To Do',
    [TASKS.DEPARTMENT]: fields.departments,
  }
  const ids = await createTasksBatch([record])
  return ids[0]
}

export async function measurementTaskExists(projectId: string): Promise<boolean> {
  const formula = `AND({${TASKS.PROJECT}} = "${projectId}", {${TASKS.TASK_NAME}} = "Take Measurements", {${TASKS.STATUS}} != "Completed")`
  const records = await fetchAll(TASKS.TABLE_ID, { filterByFormula: formula, fields: [TASKS.STATUS] })
  return records.length > 0
}

export async function createCalendarEvent(input: {
  title: string
  date: string
  notes?: string
  projectId?: string
  createdBy?: string
  customTask?: string
}): Promise<void> {
  const fields: Record<string, unknown> = {
    [CALENDAR_EVENTS.TITLE]: input.title,
    [CALENDAR_EVENTS.DATE]: input.date,
  }
  if (input.notes) fields[CALENDAR_EVENTS.NOTES] = input.notes
  if (input.projectId) fields[CALENDAR_EVENTS.PROJECT] = [input.projectId]
  if (input.createdBy) fields[CALENDAR_EVENTS.CREATED_BY] = input.createdBy
  if (input.customTask) fields[CALENDAR_EVENTS.CUSTOM_TASK] = input.customTask
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

// ─── Task Generation (A2) ─────────────────────────────────────────────────────

export interface TaskTemplate {
  id: string
  taskName: string
  templateOrder: number | null
  department: string[]
  requiresManagerReview: boolean
  projectStage: string | null
  pathCondition: string | null
  phaseLabel: string | null
  instructions: string | null
  arabicInstructions: string | null
}

export async function getTaskTemplates(stage?: string): Promise<TaskTemplate[]> {
  const opts: Parameters<typeof buildUrl>[1] = {
    sort: [{ field: TASK_TEMPLATES.TEMPLATE_ORDER, direction: 'asc' }],
  }
  if (stage) {
    opts.filterByFormula = `{${TASK_TEMPLATES.PROJECT_STAGE}} = "${stage}"`
  }
  const records = await fetchAll(TASK_TEMPLATES.TABLE_ID, opts)
  return records
    .map((r) => {
      const f = r.fields
      const rawDept = f[TASK_TEMPLATES.DEPARTMENT]
      const dept = Array.isArray(rawDept)
        ? (rawDept as { name: string }[]).map((d) => d.name)
        : []
      const rawPhase = f[TASK_TEMPLATES.PHASE] as { name: string } | string | null | undefined
      return {
        id: r.id,
        taskName: (f[TASK_TEMPLATES.TASK_NAME] as string) ?? '',
        templateOrder: f[TASK_TEMPLATES.TEMPLATE_ORDER] != null
          ? (f[TASK_TEMPLATES.TEMPLATE_ORDER] as number)
          : null,
        department: dept,
        requiresManagerReview: (f[TASK_TEMPLATES.REQUIRES_MANAGER_REVIEW] as boolean) ?? false,
        projectStage: selectName(f[TASK_TEMPLATES.PROJECT_STAGE]) ?? null,
        pathCondition: selectName(f[TASK_TEMPLATES.PATH_CONDITION]) ?? null,
        phaseLabel: typeof rawPhase === 'object' && rawPhase !== null
          ? (rawPhase as { name: string }).name
          : (rawPhase as string | null) ?? null,
        instructions: (f[TASK_TEMPLATES.INSTRUCTIONS] as string) ?? null,
        arabicInstructions: (f[TASK_TEMPLATES.ARABIC_INSTRUCTIONS] as string) ?? null,
      }
    })
    .filter((t) => t.taskName !== '')
}

async function createTasksBatch(
  records: Array<Record<string, unknown>>,
): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < records.length; i += 10) {
    const chunk = records.slice(i, i + 10)
    const res = await fetchWithRetry(tblUrl(TASKS.TABLE_ID), {
      method: 'POST',
      headers: airtableHeaders(),
      body: JSON.stringify({ records: chunk.map((fields) => ({ fields })), typecast: true }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Airtable error ${res.status}: ${body}`)
    }
    const data = (await res.json()) as { records: RawRecord[] }
    ids.push(...data.records.map((r) => r.id))
  }
  return ids
}

export async function getTaskCountForProject(projectId: string): Promise<number> {
  const formula = `{${TASKS.PROJECT}} = "${projectId}"`
  const records = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: formula,
    fields: [TASKS.STATUS],
  })
  return records.length
}

export async function generateTasksForProject(
  projectId: string,
  stage: string,
): Promise<{ created: number; skipped: number; todoTemplates: TaskTemplate[] }> {
  // Lock all active tasks from the previous phase so they disappear from dashboards
  const lockFormula = `AND({${TASKS.PROJECT}} = "${projectId}", OR({${TASKS.STATUS}}="To Do", {${TASKS.STATUS}}="In Progress", {${TASKS.STATUS}}="Pending Approval"))`
  const toArchive = await fetchAll(TASKS.TABLE_ID, { filterByFormula: lockFormula, fields: [TASKS.STATUS] })
  if (toArchive.length > 0) {
    await Promise.all(toArchive.map((r) => updateTaskRaw(r.id, { [TASKS.STATUS]: 'Locked' as TaskStatus })))
  }

  const fetchedTemplates = await getTaskTemplates(stage)
  if (fetchedTemplates.length === 0) return { created: 0, skipped: 0, todoTemplates: [] }

  // For the "Open" stage, only generate project-level Phase 2 templates.
  // Per-item templates (perItemOrderMin+) and per-item GATE tasks (null order) are generated
  // per-item via generateItemTasksForProject when the F5 quotation is submitted.
  const openCfg = PHASE_CONFIG.Open
  const allTemplates = stage === 'Open'
    ? fetchedTemplates.filter(
        (t) =>
          t.templateOrder !== null &&
          t.templateOrder <= openCfg.projectLevelOrderMax &&
          (t.phaseLabel === null || t.phaseLabel === openCfg.phaseLabel),
      )
    : fetchedTemplates

  if (allTemplates.length === 0) return { created: 0, skipped: 0, todoTemplates: [] }

  const ordered = allTemplates.filter((t) => t.templateOrder !== null)
  const universalOrdered = ordered.filter((t) => t.pathCondition === null)
  const pathGroups = new Map<string, typeof ordered>()
  for (const t of ordered) {
    if (t.pathCondition !== null) {
      const g = pathGroups.get(t.pathCondition) ?? []
      g.push(t)
      pathGroups.set(t.pathCondition, g)
    }
  }

  const universalOrders = universalOrdered.map((t) => t.templateOrder!).sort((a, b) => a - b)
  // In the Preparing stage the very first ordered task ("First Call — Project Shell Created")
  // is auto-completed because the call already happened when the project was created.
  // For every other stage the first ordered task is the active one that opens as To Do.
  const firstOrder = universalOrders[0] ?? Infinity
  const secondOrder = universalOrders[1] ?? Infinity
  const preparingCfg = PHASE_CONFIG.Preparing
  const firstIsAutoCompleted = stage === 'Preparing' && preparingCfg.autoCompleteFirstTask
  const activeOrder = firstIsAutoCompleted ? secondOrder : firstOrder

  const pathMinMap = new Map<string, number>()
  Array.from(pathGroups.entries()).forEach(([path, group]) => {
    pathMinMap.set(path, Math.min(...group.map((t) => t.templateOrder!)))
  })

  const now = new Date().toISOString()
  const todoTemplates: TaskTemplate[] = []

  const records = allTemplates.map((t) => {
    let status: TaskStatus
    if (t.templateOrder === null) {
      // The inactivity Follow Up task starts Locked — only unlocked after 3 days of no activity
      status = t.taskName === 'Follow Up' ? 'Locked' : 'To Do'
    } else if (t.pathCondition === null) {
      if (firstIsAutoCompleted && t.templateOrder === firstOrder) status = 'Completed'
      else if (t.templateOrder === activeOrder) status = 'To Do'
      else status = 'Locked'
    } else {
      // All paths run in parallel — the first task in every path starts as To Do
      const pathMin = pathMinMap.get(t.pathCondition)!
      status = t.templateOrder === pathMin ? 'To Do' : 'Locked'
    }
    if (status === 'To Do') todoTemplates.push(t)
    const record: Record<string, unknown> = {
      [TASKS.TASK_NAME]: t.taskName,
      [TASKS.PROJECT]: projectId,
      [TASKS.STATUS]: status,
      [TASKS.TASK_TEMPLATES_LINK]: [t.id],
    }
    if (status === 'Completed') {
      record[TASKS.COMPLETED_AT] = now
    }
    if (t.pathCondition !== null) {
      record[TASKS.PATH_CONDITION] = t.pathCondition
    }
    return record
  })

  const ids = await createTasksBatch(records)
  return { created: ids.length, skipped: allTemplates.length - ids.length, todoTemplates }
}

export async function generateItemTasksForProject(
  projectId: string,
  itemId: string,
  chosenPaths: string[],
): Promise<{ created: number; todoTemplates: TaskTemplate[] }> {
  const allOpenTemplates = await getTaskTemplates('Open')

  // Per-item templates: null order (GATE tasks) or order >= perItemOrderMin, Phase 2 only
  const { perItemOrderMin, phaseLabel } = PHASE_CONFIG.Open
  const itemTemplates = allOpenTemplates.filter(
    (t) =>
      (t.phaseLabel === null || t.phaseLabel === phaseLabel) &&
      (t.templateOrder === null || t.templateOrder >= perItemOrderMin) &&
      (t.pathCondition === null || chosenPaths.includes(t.pathCondition)),
  )
  if (itemTemplates.length === 0) return { created: 0, todoTemplates: [] }

  // Idempotency: fetch existing tasks for this item and skip paths/templates already created.
  // This allows safely adding new actions to an item after initial submission.
  const existingRaw = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: `AND(FIND("${projectId}", ARRAYJOIN({${TASKS.PROJECT}})), FIND("${itemId}", ARRAYJOIN({${TASKS.PROJECT_ITEM}})))`,
    fields: [TASKS.PATH_CONDITION, TASKS.TASK_TEMPLATES_LINK],
  })
  const existingPaths = new Set<string>()
  const existingTemplateIds = new Set<string>()
  for (const r of existingRaw) {
    const path = selectName(r.fields[TASKS.PATH_CONDITION])
    if (path) existingPaths.add(path)
    const tplLinks = r.fields[TASKS.TASK_TEMPLATES_LINK]
    if (Array.isArray(tplLinks)) {
      for (const id of tplLinks) existingTemplateIds.add(id as string)
    }
  }

  const newTemplates = itemTemplates.filter((t) =>
    t.pathCondition !== null ? !existingPaths.has(t.pathCondition) : !existingTemplateIds.has(t.id),
  )
  if (newTemplates.length === 0) return { created: 0, todoTemplates: [] }

  // Build per-path min-order map so each new path's first task starts as To Do
  const orderedTemplates = newTemplates.filter((t) => t.templateOrder !== null)
  const pathMinMap = new Map<string | null, number>()
  for (const t of orderedTemplates) {
    const path = t.pathCondition ?? null
    const existing = pathMinMap.get(path)
    if (existing === undefined || t.templateOrder! < existing) {
      pathMinMap.set(path, t.templateOrder!)
    }
  }

  const todoTemplates: TaskTemplate[] = []

  const records = newTemplates.map((t) => {
    let status: TaskStatus
    const isGate = /\[gate\]/i.test(t.taskName) && !/\[gateway\]/i.test(t.taskName)
    if (t.templateOrder === null || isGate) {
      status = 'To Do'
    } else if (t.pathCondition !== null) {
      // Action path tasks all start as To Do — visible and workable immediately after quotation
      status = 'To Do'
    } else {
      const pathMin = pathMinMap.get(null)!
      status = t.templateOrder === pathMin ? 'To Do' : 'Locked'
    }
    if (status === 'To Do') todoTemplates.push(t)
    const record: Record<string, unknown> = {
      [TASKS.TASK_NAME]: t.taskName,
      [TASKS.PROJECT]: projectId,
      [TASKS.PROJECT_ITEM]: [itemId],
      [TASKS.STATUS]: status,
      [TASKS.TASK_TEMPLATES_LINK]: [t.id],
    }
    if (t.pathCondition !== null) {
      record[TASKS.PATH_CONDITION] = t.pathCondition
    }
    return record
  })

  const ids = await createTasksBatch(records)
  return { created: ids.length, todoTemplates }
}

export async function generatePhase3TasksForItem(
  projectId: string,
  itemId: string,
): Promise<{ created: number; todoTemplates: TaskTemplate[] }> {
  const allTemplates = await getTaskTemplates()
  const templates = allTemplates.filter(
    (t) => t.phaseLabel === PHASE_CONFIG.Working.phaseLabel,
  )
  if (templates.length === 0) return { created: 0, todoTemplates: [] }

  // Idempotency: skip templates already created for this item
  const existingRaw = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: `AND(FIND("${projectId}", ARRAYJOIN({${TASKS.PROJECT}})), FIND("${itemId}", ARRAYJOIN({${TASKS.PROJECT_ITEM}})))`,
    fields: [TASKS.TASK_TEMPLATES_LINK],
  })
  const existingTemplateIds = new Set<string>()
  for (const r of existingRaw) {
    const links = r.fields[TASKS.TASK_TEMPLATES_LINK]
    if (Array.isArray(links)) links.forEach((id) => existingTemplateIds.add(id as string))
  }
  const newTemplates = templates.filter((t) => !existingTemplateIds.has(t.id))
  if (newTemplates.length === 0) return { created: 0, todoTemplates: [] }

  // Sequential unlock: the lowest-order new template starts as To Do, everything else Locked.
  // The workflow's unlockNextTasks will unlock subsequent tasks as each one completes.
  const orderedNew = newTemplates.filter((t) => t.templateOrder !== null)
  const minNewOrder = orderedNew.length > 0
    ? Math.min(...orderedNew.map((t) => t.templateOrder!))
    : null

  const todoTemplates: TaskTemplate[] = []

  const records = newTemplates.map((t) => {
    const status: TaskStatus =
      t.templateOrder === minNewOrder ? 'To Do' : 'Locked'
    if (status === 'To Do') todoTemplates.push(t)
    return {
      [TASKS.TASK_NAME]: t.taskName,
      [TASKS.PROJECT]: projectId,
      [TASKS.PROJECT_ITEM]: [itemId],
      [TASKS.STATUS]: status,
      [TASKS.TASK_TEMPLATES_LINK]: [t.id],
    }
  })

  const ids = await createTasksBatch(records)
  return { created: ids.length, todoTemplates }
}

export async function generatePhase4Tasks(
  projectId: string,
): Promise<{ created: number; todoTemplates: TaskTemplate[] }> {
  const allTemplates = await getTaskTemplates('Closed')
  // Only ordered Phase 4 tasks — exclude the unordered warranty/maintenance templates
  const templates = allTemplates.filter(
    (t) => t.phaseLabel === PHASE_CONFIG.Closing.phaseLabel && t.templateOrder !== null,
  )
  if (templates.length === 0) return { created: 0, todoTemplates: [] }

  const minOrder = Math.min(...templates.map((t) => t.templateOrder!))
  const todoTemplates: TaskTemplate[] = []

  const records = templates.map((t) => {
    const status: TaskStatus = t.templateOrder === minOrder ? 'To Do' : 'Locked'
    if (status === 'To Do') todoTemplates.push(t)
    return {
      [TASKS.TASK_NAME]: t.taskName,
      [TASKS.PROJECT]: projectId,
      [TASKS.STATUS]: status,
      [TASKS.TASK_TEMPLATES_LINK]: [t.id],
    }
  })

  const ids = await createTasksBatch(records)
  return { created: ids.length, todoTemplates }
}

// ─── Item Types ───────────────────────────────────────────────────────────────

// ─── Project Items ────────────────────────────────────────────────────────────

function transformProjectItem(record: RawRecord): ProjectItem {
  const f = record.fields
  return {
    id: record.id,
    itemName: str(f[PROJECT_ITEMS.ITEM_NAME]) ?? '',
    itemId: str(f[PROJECT_ITEMS.ITEM_ID]) ?? '',
    project: strArr(f[PROJECT_ITEMS.PROJECT]),
    status: str(f[PROJECT_ITEMS.STATUS]),
    quantity: num(f[PROJECT_ITEMS.QUANTITY]),
    itemCreatedAt: str(f[PROJECT_ITEMS.ITEM_CREATED_AT]),
  }
}

export async function createProjectItem(input: {
  projectId: string
  itemName: string
  quantity: number
}): Promise<ProjectItem> {
  const fields: Record<string, unknown> = {
    [PROJECT_ITEMS.ITEM_NAME]: input.itemName,
    [PROJECT_ITEMS.PROJECT]: [input.projectId],
    [PROJECT_ITEMS.QUANTITY]: input.quantity,
  }
  const res = await fetchWithRetry(tblUrl(PROJECT_ITEMS.TABLE_ID), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformProjectItem(record)
}

export async function getProjectItemsForProject(projectId: string): Promise<ProjectItem[]> {
  const formula = `FIND("${projectId}", ARRAYJOIN({${PROJECT_ITEMS.PROJECT}}, ","))`
  const records = await fetchAll(PROJECT_ITEMS.TABLE_ID, {
    filterByFormula: formula,
    sort: [{ field: PROJECT_ITEMS.ITEM_SEQUENCE, direction: 'asc' }],
  })
  return records.map(transformProjectItem)
}

// ─── Quotations ───────────────────────────────────────────────────────────────

function transformQuotation(record: RawRecord): Quotation {
  const f = record.fields
  return {
    id: record.id,
    name: str(f[QUOTATIONS.NAME]) ?? '',
    project: strArr(f[QUOTATIONS.PROJECT]),
    projectItem: strArr(f[QUOTATIONS.PROJECT_ITEM]),
    description: str(f[QUOTATIONS.DESCRIPTION]),
    quantity: num(f[QUOTATIONS.QUANTITY]),
    unitPrice: num(f[QUOTATIONS.UNIT_PRICE]),
    quotationStatus: str(f[QUOTATIONS.QUOTATION_STATUS]),
    notes: str(f[QUOTATIONS.NOTES]),
    sentDate: str(f[QUOTATIONS.SENT_DATE]),
    approvedDate: str(f[QUOTATIONS.APPROVED_DATE]),
    recordedBy: str(f[QUOTATIONS.RECORDED_BY]),
  }
}

export async function createQuotation(input: {
  projectId: string
  projectItemId: string
  itemName: string
  quantity: number
  unitPrice: number
  description?: string
  notes?: string
  quotationDate?: string
  recordedBy?: string
}): Promise<Quotation> {
  const fields: Record<string, unknown> = {
    [QUOTATIONS.NAME]: input.itemName,
    [QUOTATIONS.PROJECT]: [input.projectId],
    [QUOTATIONS.PROJECT_ITEM]: [input.projectItemId],
    [QUOTATIONS.QUANTITY]: input.quantity,
    [QUOTATIONS.UNIT_PRICE]: input.unitPrice,
  }
  if (input.description) fields[QUOTATIONS.DESCRIPTION] = input.description
  if (input.notes) fields[QUOTATIONS.NOTES] = input.notes
  if (input.quotationDate) fields[QUOTATIONS.SENT_DATE] = input.quotationDate
  if (input.recordedBy) fields[QUOTATIONS.RECORDED_BY] = input.recordedBy

  const res = await fetchWithRetry(tblUrl(QUOTATIONS.TABLE_ID), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformQuotation(record)
}

export async function getQuotationsByProject(projectId: string): Promise<Quotation[]> {
  const formula = `FIND("${projectId}", ARRAYJOIN({${QUOTATIONS.PROJECT}}, ","))`
  const records = await fetchAll(QUOTATIONS.TABLE_ID, { filterByFormula: formula })
  return records.map(transformQuotation)
}

// ─── Timesheets ──────────────────────────────────────────────────────────────

function transformTimesheetEntry(rec: RawRecord): TimesheetEntry {
  const f = rec.fields
  return {
    id: rec.id,
    entryLabel: str(f[PRODUCTION_TIMESHEETS.ENTRY_LABEL]),
    workDate: str(f[PRODUCTION_TIMESHEETS.WORK_DATE]) ?? '',
    workerIds: strArr(f[PRODUCTION_TIMESHEETS.WORKER]),
    projectIds: strArr(f[PRODUCTION_TIMESHEETS.PROJECT]),
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

  // Enrich with worker names
  const allWorkers = await getAllWorkers()
  const workerNameMap = new Map(allWorkers.map((w) => [w.id, w.nickname ? `${w.name} (${w.nickname})` : w.name]))
  for (const entry of entries) {
    const wId = entry.workerIds[0]
    if (wId) entry.workerName = workerNameMap.get(wId) ?? entry.workerName
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
  workerId: string,
  projectId: string,
  workDate: string,
): Promise<boolean> {
  const formula = `AND({${PRODUCTION_TIMESHEETS.WORK_DATE}}="${workDate}", FIND("${workerId}", ARRAYJOIN({${PRODUCTION_TIMESHEETS.WORKER}}, ",")), FIND("${projectId}", ARRAYJOIN({${PRODUCTION_TIMESHEETS.PROJECT}}, ",")))`
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
    [PRODUCTION_TIMESHEETS.WORKER]: input.workerIds,
    [PRODUCTION_TIMESHEETS.PROJECT]: input.projectIds,
    [PRODUCTION_TIMESHEETS.REGULAR_HOURS]: regular,
    [PRODUCTION_TIMESHEETS.OVERTIME_HOURS]: overtime,
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

export async function getTimesheetWorkers(): Promise<WorkerOption[]> {
  const records = await fetchAll(WORKERS.TABLE, {
    filterByFormula: `{${WORKERS.ACTIVE}}=TRUE()`,
    sort: [{ field: WORKERS.NAME, direction: 'asc' }],
    fields: [WORKERS.NAME, WORKERS.FULL_NAME, WORKERS.NICKNAME, WORKERS.ROLE, WORKERS.ACTIVE],
  })
  return records.map((rec) => {
    const f = rec.fields
    return {
      id: rec.id,
      name: str(f[WORKERS.NAME]) ?? rec.id,
      fullName: str(f[WORKERS.FULL_NAME]),
      nickname: str(f[WORKERS.NICKNAME]),
      role: selectName(f[WORKERS.ROLE]),
    }
  })
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
    const wId = entry.workerIds[0] ?? 'unknown'
    if (!workerMap.has(wId)) {
      workerMap.set(wId, { workerName: entry.workerName ?? wId, days: new Map() })
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

// ─── Workers CRUD ─────────────────────────────────────────────────────────────

function transformWorker(rec: RawRecord): WorkerOption {
  const f = rec.fields
  return {
    id: rec.id,
    name: str(f[WORKERS.NAME]) ?? rec.id,
    fullName: str(f[WORKERS.FULL_NAME]),
    nickname: str(f[WORKERS.NICKNAME]),
    role: selectName(f[WORKERS.ROLE]),
    active: bool(f[WORKERS.ACTIVE]) ?? false,
  }
}

export async function getAllWorkers(): Promise<WorkerOption[]> {
  const records = await fetchAll(WORKERS.TABLE, {
    sort: [{ field: WORKERS.NAME, direction: 'asc' }],
    fields: [WORKERS.NAME, WORKERS.FULL_NAME, WORKERS.NICKNAME, WORKERS.ROLE, WORKERS.ACTIVE],
  })
  return records.map(transformWorker)
}

export async function createWorker(input: WorkerCreateInput): Promise<WorkerOption> {
  const fields: Record<string, unknown> = {
    [WORKERS.NAME]: input.name,
  }
  if (input.fullName) fields[WORKERS.FULL_NAME] = input.fullName
  if (input.nickname) fields[WORKERS.NICKNAME] = input.nickname
  if (input.role) fields[WORKERS.ROLE] = input.role
  if (input.active !== undefined) fields[WORKERS.ACTIVE] = input.active
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
  if (input.active !== undefined) fields[WORKERS.ACTIVE] = input.active
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
