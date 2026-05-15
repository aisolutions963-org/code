import {
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
  ITEM_TYPES,
  PURCHASE_ORDERS,
  INSTALLATION_LOGS,
} from './fieldMap'
import {
  Role,
  Task,
  TaskStatus,
  TaskUpdateInput,
  AttachmentInput,
  Attachment,
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
  HandoverSheet,
  ItemType,
  ProjectItem,
  Quotation,
  PurchaseOrder,
  PurchaseOrderCreateInput,
  InstallationLog,
  InstallationLogCreateInput,
} from './types'
import { ROLE_TO_DEPARTMENT } from './permissions'
import { validateEnv } from './env'
import { recordAirtableFailure } from './metrics'

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
function numArr(val: unknown): number[] {
  return Array.isArray(val) ? (val as number[]) : []
}
function boolArr(val: unknown): boolean[] {
  return Array.isArray(val) ? (val as boolean[]) : []
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
    department: strArr(f[TASKS.DEPARTMENT]),
    taskOrder: numArr(f[TASKS.TASK_ORDER]),
    templateOrder: numArr(f[TASKS.TEMPLATE_ORDER]),
    projectId: str(f[TASKS.PROJECT_ID]),
    project: strArr(f[TASKS.PROJECT]),
    projectItem: strArr(f[TASKS.PROJECT_ITEM]),
    taskDocuments: attachments(f[TASKS.TASK_DOCUMENTS]),
    handoverDocument: attachments(f[TASKS.HANDOVER_DOCUMENT]),
    fillersAndMissingList: attachments(f[TASKS.FILLERS_MISSING_ITEMS_LIST]),
    instructions: strArr(f[TASKS.INSTRUCTIONS]),
    arabicInstructions: strArr(f[TASKS.ARABIC_INSTRUCTIONS]),
    managerReviewStatus: str(f[TASKS.MANAGER_REVIEW_STATUS]) as Task['managerReviewStatus'],
    managerComment: str(f[TASKS.MANAGER_COMMENT]),
    requiresManagerReview: boolArr(f[TASKS.REQUIRES_MANAGER_REVIEW]),
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
    assignedTo: strArr(f[TASKS.ASSIGNED_TO]),
    callCount: num(f[TASKS.CALL_COUNT]),
    pathCondition: str(f[TASKS.PATH_CONDITION]),
  }
}

function transformProject(record: RawRecord): Project {
  const f = record.fields
  const owner = f[PROJECTS.SALES_OWNER] as { id: string; email: string; name: string } | undefined
  return {
    id: record.id,
    projectName: str(f[PROJECTS.PROJECT_NAME]) ?? '',
    nickname: str(f[PROJECTS.NICKNAME]),
    projectId: str(f[PROJECTS.PROJECT_ID]) ?? '',
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
    assignedInstallationTeam: strArr(f[PROJECTS.ASSIGNED_INSTALLATION_TEAM]),
    emirate: str(f[PROJECTS.EMIRATE]),
    location: str(f[PROJECTS.LOCATION]),
    detailedLocation: str(f[PROJECTS.DETAILED_LOCATION]),
    projectDescription: str(f[PROJECTS.PROJECT_DESCRIPTION]),
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
  handoverDocument: TASKS.HANDOVER_DOCUMENT,
  fillersAndMissingList: TASKS.FILLERS_MISSING_ITEMS_LIST,
  requiresManagerReviewManually: TASKS.REQUIRES_MANAGER_REVIEW_MANUALLY,
  priorityFlag: TASKS.PRIORITY_FLAG,
  callCount: TASKS.CALL_COUNT,
}

function toAirtableFields(input: Partial<TaskUpdateInput>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    const fieldId = TASK_FIELD_TO_ID[key as keyof TaskUpdateInput]
    if (!fieldId) continue
    result[fieldId] = value
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
  return `AND(${deptOr}, {${TASKS.STATUS}} != "Locked")`
}

export async function getTasksByRole(
  role: Role,
  options: { projectId?: string } = {},
): Promise<Task[]> {
  let formula = buildDepartmentFormula(role)
  if (options.projectId) {
    formula = `AND(${formula}, FIND("${options.projectId}", ARRAYJOIN({${TASKS.PROJECT_RECORD_ID}}, ",")))`
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
  // PROJECT_RECORD_ID is a lookup of the project's RECORD_ID() — filterable by record ID string
  const projectFilter = `FIND("${projectId}", ARRAYJOIN({${TASKS.PROJECT_RECORD_ID}}, ","))`
  const formula = itemId
    ? `AND(${projectFilter}, {${TASKS.STATUS}}="Locked")`
    : `AND(${projectFilter}, {${TASKS.STATUS}}="Locked", {${TASKS.PROJECT_ITEM}}=BLANK())`
  const records = await fetchAll(TASKS.TABLE_ID, { filterByFormula: formula })
  const tasks = records.map(transformTask)
  // For item scope, post-filter in JS since project item linked field isn't filterable by record ID
  return itemId ? tasks.filter((t) => t.projectItem?.[0] === itemId) : tasks
}

export async function getProjects(options: { stage?: string } = {}): Promise<Project[]> {
  let formula = `NOT(OR({${PROJECTS.PROJECT_STAGE}}="Closed", {${PROJECTS.PROJECT_STAGE}}="Archived"))`
  if (options.stage) {
    formula = `{${PROJECTS.PROJECT_STAGE}}="${options.stage}"`
  }
  const records = await fetchAll(PROJECTS.TABLE_ID, {
    filterByFormula: formula,
    sort: [{ field: PROJECTS.PROJECT_CREATED_AT, direction: 'desc' }],
  })
  return records.map(transformProject)
}

export async function getAllProjects(): Promise<Project[]> {
  const records = await fetchAll(PROJECTS.TABLE_ID, {
    sort: [{ field: PROJECTS.PROJECT_CREATED_AT, direction: 'desc' }],
  })
  return records.map(transformProject)
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

export async function createProject(input: ProjectCreateInput): Promise<Project> {
  const fields: Record<string, unknown> = {
    [PROJECTS.PROJECT_NAME]: input.projectName,
    [PROJECTS.NICKNAME]: input.nickname,
    [PROJECTS.CLIENT_NAME]: input.clientName,
    [PROJECTS.PROJECT_DESCRIPTION]: input.projectDescription,
    [PROJECTS.DETAILED_LOCATION]: input.detailedLocation,
    [PROJECTS.PAYMENT_MODE]: input.paymentMode,
    [PROJECTS.REQUIRED_INTAKE_PATHS]: input.requiredIntakePaths,
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
    [TASKS.HANDOVER_DOCUMENT]: 'handoverDocument',
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
  const formula = `AND(FIND("${projectId}", ARRAYJOIN({${TASKS.PROJECT_RECORD_ID}}, ",")), {${TASKS.STATUS}} != "Locked")`
  const records = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: formula,
    sort: [{ field: TASKS.TEMPLATE_ORDER, direction: 'asc' }],
  })
  let tasks = records.map(transformTask)
  tasks = await enrichTasksWithAssigneeNames(tasks)
  return tasks
}

export async function getIncompleteTasksForProject(projectId: string): Promise<Task[]> {
  const formula = `AND(FIND("${projectId}", ARRAYJOIN({${TASKS.PROJECT_RECORD_ID}}, ",")), {${TASKS.STATUS}} != "Completed", {${TASKS.STATUS}} != "Locked")`
  const records = await fetchAll(TASKS.TABLE_ID, { filterByFormula: formula })
  return records.map(transformTask)
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
): Promise<Project> {
  return updateProject(projectId, {
    [PROJECTS.ASSIGNED_INSTALLATION_TEAM]: teamMemberIds,
  })
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

  const refMap: Record<string, string> = {}
  const chunks: string[][] = []
  for (let i = 0; i < projectIds.length; i += 10) {
    chunks.push(projectIds.slice(i, i + 10))
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const formula = `OR(${chunk.map((id) => `RECORD_ID()="${id}"`).join(',')})`
      const records = await fetchAll(PROJECTS.TABLE_ID, {
        filterByFormula: formula,
        fields: [PROJECTS.PROJECT_ID],
      })
      for (const r of records) {
        const ref = str(r.fields[PROJECTS.PROJECT_ID])
        if (ref) refMap[r.id] = ref
      }
    }),
  )

  return tasks.map((t) => {
    const pid = t.project?.[0]
    const ref = pid ? refMap[pid] : undefined
    return ref ? { ...t, projectRef: ref } : t
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
  manager: 'Management',
}

export async function getAnnouncements(role?: string): Promise<Announcement[]> {
  const today = new Date().toISOString().slice(0, 10)
  const expiryFilter = `OR({${ANNOUNCEMENTS.EXPIRES_AT}}="", IS_AFTER({${ANNOUNCEMENTS.EXPIRES_AT}}, "${today}"), {${ANNOUNCEMENTS.EXPIRES_AT}}=BLANK())`

  let visibilityFilter: string
  if (!role || role === 'superadmin') {
    visibilityFilter = `OR({${ANNOUNCEMENTS.VISIBLE_TO}}="All", {${ANNOUNCEMENTS.VISIBLE_TO}}=BLANK(), {${ANNOUNCEMENTS.VISIBLE_TO}}="")`
  } else {
    const audience = ROLE_TO_AUDIENCE[role]
    visibilityFilter = audience
      ? `OR({${ANNOUNCEMENTS.VISIBLE_TO}}="All", {${ANNOUNCEMENTS.VISIBLE_TO}}=BLANK(), {${ANNOUNCEMENTS.VISIBLE_TO}}="", {${ANNOUNCEMENTS.VISIBLE_TO}}="${audience}")`
      : `OR({${ANNOUNCEMENTS.VISIBLE_TO}}="All", {${ANNOUNCEMENTS.VISIBLE_TO}}=BLANK(), {${ANNOUNCEMENTS.VISIBLE_TO}}="")`
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
  }
}

export async function getMaterialsByProject(projectId: string): Promise<Material[]> {
  const formula = `FIND("${projectId}", ARRAYJOIN({${MATERIALS_NEEDED.PROJECTS}}, ","))`
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

// ─── Handover Sheets ──────────────────────────────────────────────────────────

function transformHandoverSheet(record: RawRecord): HandoverSheet {
  const f = record.fields
  return {
    id: record.id,
    handoverId: str(f[HANDOVER_SHEETS.HANDOVER_ID]),
    project: strArr(f[HANDOVER_SHEETS.PROJECT]) ?? [],
    status: str(f[HANDOVER_SHEETS.STATUS]) ?? 'Pending',
    notes: str(f[HANDOVER_SHEETS.NOTES]),
  }
}

export async function createHandoverSheet(
  projectId: string,
  notes?: string,
): Promise<HandoverSheet> {
  const fields: Record<string, unknown> = {
    [HANDOVER_SHEETS.PROJECT]: [projectId],
    [HANDOVER_SHEETS.STATUS]: 'Generated',
  }
  if (notes) fields[HANDOVER_SHEETS.NOTES] = notes
  const res = await fetchWithRetry(tblUrl(HANDOVER_SHEETS.TABLE_ID), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ records: [{ fields }] }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const data = (await res.json()) as { records: RawRecord[] }
  return transformHandoverSheet(data.records[0])
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
  type: 'installation' | 'delivery' | 'activity' | 'payment-due' | 'payment-received'
  projectId?: string
  projectName?: string
  amount?: number
}

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  const [gatePasses, tasks, payments] = await Promise.all([
    fetchAll(GATE_PASSES.TABLE_ID, {
      filterByFormula: `NOT({${GATE_PASSES.ESTIMATED_SUPPLY_DATE}}=BLANK())`,
      fields: [GATE_PASSES.NAME, GATE_PASSES.ESTIMATED_SUPPLY_DATE, GATE_PASSES.CONFIRMED_DELIVERY_DATE, GATE_PASSES.PROJECT],
      sort: [{ field: GATE_PASSES.ESTIMATED_SUPPLY_DATE, direction: 'asc' }],
    }),
    fetchAll(TASKS.TABLE_ID, {
      filterByFormula: `AND(NOT({${TASKS.TASK_START_DATE}}=BLANK()), OR({${TASKS.STATUS}}="In Progress", {${TASKS.STATUS}}="To Do"))`,
      fields: [TASKS.TASK_NAME, TASKS.TASK_START_DATE, TASKS.COMPLETION_DATE, TASKS.DEPARTMENT, TASKS.PROJECT_ID],
      sort: [{ field: TASKS.TASK_START_DATE, direction: 'asc' }],
    }),
    fetchAll(PAYMENTS.TABLE_ID, {
      filterByFormula: `OR(NOT({${PAYMENTS.DUE_DATE}}=BLANK()), NOT({${PAYMENTS.RECEIVED_DATE}}=BLANK()))`,
      fields: [PAYMENTS.NAME, PAYMENTS.AMOUNT, PAYMENTS.PAYMENT_TYPE, PAYMENTS.DUE_DATE, PAYMENTS.RECEIVED_DATE, PAYMENTS.PROJECT],
    }),
  ])

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
    })
  }

  for (const r of payments) {
    const f = r.fields
    const name = str(f[PAYMENTS.NAME]) ?? str(f[PAYMENTS.PAYMENT_TYPE]) ?? 'Payment'
    const amount = num(f[PAYMENTS.AMOUNT])
    const receivedDate = str(f[PAYMENTS.RECEIVED_DATE])
    const dueDate = str(f[PAYMENTS.DUE_DATE])
    if (receivedDate) {
      events.push({ id: `${r.id}-rcv`, title: name, date: receivedDate, type: 'payment-received', amount })
    }
    if (dueDate && dueDate !== receivedDate) {
      events.push({ id: `${r.id}-due`, title: name, date: dueDate, type: 'payment-due', amount })
    }
  }

  return events
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
      const rawStage = f[TASK_TEMPLATES.PROJECT_STAGE] as { name: string } | null | undefined
      const rawPath = f[TASK_TEMPLATES.PATH_CONDITION] as { name: string } | null | undefined
      return {
        id: r.id,
        taskName: (f[TASK_TEMPLATES.TASK_NAME] as string) ?? '',
        templateOrder: f[TASK_TEMPLATES.TEMPLATE_ORDER] != null
          ? (f[TASK_TEMPLATES.TEMPLATE_ORDER] as number)
          : null,
        department: dept,
        requiresManagerReview: (f[TASK_TEMPLATES.REQUIRES_MANAGER_REVIEW] as boolean) ?? false,
        projectStage: rawStage?.name ?? null,
        pathCondition: rawPath?.name ?? null,
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
      body: JSON.stringify({ records: chunk.map((fields) => ({ fields })) }),
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
  const formula = `FIND("${projectId}", ARRAYJOIN({${TASKS.PROJECT_RECORD_ID}}, ","))`
  const records = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: formula,
    fields: [TASKS.STATUS],
  })
  return records.length
}

export async function generateTasksForProject(
  projectId: string,
  stage: string,
): Promise<{ created: number; skipped: number }> {
  const allTemplates = await getTaskTemplates(stage)
  if (allTemplates.length === 0) return { created: 0, skipped: 0 }

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
  // First Call (order 1) is already done by the time the project is created in the system
  const firstCallOrder = universalOrders[0] ?? Infinity
  const f1Order = universalOrders[1] ?? Infinity   // F1 — Fill Form is the new active task

  const pathMinMap = new Map<string, number>()
  Array.from(pathGroups.entries()).forEach(([path, group]) => {
    pathMinMap.set(path, Math.min(...group.map((t) => t.templateOrder!)))
  })

  const now = new Date().toISOString()

  const records = allTemplates.map((t) => {
    let status: TaskStatus
    if (t.templateOrder === null) {
      status = 'To Do'
    } else if (t.pathCondition === null) {
      if (t.templateOrder === firstCallOrder) status = 'Completed'
      else if (t.templateOrder === f1Order) status = 'To Do'
      else status = 'Locked'
    } else {
      status = t.templateOrder === pathMinMap.get(t.pathCondition)! ? 'To Do' : 'Locked'
    }
    const record: Record<string, unknown> = {
      [TASKS.TASK_NAME]: t.taskName,
      [TASKS.PROJECT]: [projectId],
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
  return { created: ids.length, skipped: allTemplates.length - ids.length }
}

// ─── Item Types ───────────────────────────────────────────────────────────────

export async function getItemTypes(): Promise<ItemType[]> {
  const records = await fetchAll(ITEM_TYPES.TABLE_ID, {
    filterByFormula: `{${ITEM_TYPES.ACTIVE}}=1`,
    sort: [{ field: ITEM_TYPES.ITEM_TYPE_NAME, direction: 'asc' }],
    fields: [ITEM_TYPES.ITEM_TYPE_NAME, ITEM_TYPES.ACTIVE],
  })
  return records.map((r) => ({
    id: r.id,
    name: str(r.fields[ITEM_TYPES.ITEM_TYPE_NAME]) ?? '',
  }))
}

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
  itemTypeId: string
  itemTypeName: string
  quantity: number
}): Promise<ProjectItem> {
  const fields: Record<string, unknown> = {
    [PROJECT_ITEMS.ITEM_NAME]: input.itemTypeName,
    [PROJECT_ITEMS.PROJECT]: [input.projectId],
    [PROJECT_ITEMS.ITEM_TYPE]: [input.itemTypeId],
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
  }
}

export async function createQuotation(input: {
  projectId: string
  projectItemId: string
  itemTypeName: string
  quantity: number
  unitPrice: number
  description?: string
  notes?: string
}): Promise<Quotation> {
  const fields: Record<string, unknown> = {
    [QUOTATIONS.NAME]: input.itemTypeName,
    [QUOTATIONS.PROJECT]: [input.projectId],
    [QUOTATIONS.PROJECT_ITEM]: [input.projectItemId],
    [QUOTATIONS.QUANTITY]: input.quantity,
    [QUOTATIONS.UNIT_PRICE]: input.unitPrice,
  }
  if (input.description) fields[QUOTATIONS.DESCRIPTION] = input.description
  if (input.notes) fields[QUOTATIONS.NOTES] = input.notes

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
