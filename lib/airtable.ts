import {
  TASKS,
  PROJECTS,
  PROJECT_ITEMS,
  PAYMENTS,
  GATE_PASSES,
  MAINTENANCE,
  TEAM_MEMBERS,
  ANNOUNCEMENTS,
  MATERIALS_NEEDED,
} from './fieldMap'
import {
  Role,
  Task,
  TaskUpdateInput,
  AttachmentInput,
  Attachment,
  Project,
  Payment,
  PaymentCreateInput,
  GatePass,
  GatePassCreateInput,
  MaintenanceRecord,
  Announcement,
  AnnouncementCreateInput,
  Material,
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
  const qs = parts.length ? `?${parts.join('&')}` : ''
  return `${BASE_URL}/${BASE_ID}/${tableId}${qs}`
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
  }
}

function transformProject(record: RawRecord): Project {
  const f = record.fields
  const owner = f[PROJECTS.SALES_OWNER] as { id: string; email: string; name: string } | undefined
  return {
    id: record.id,
    projectName: str(f[PROJECTS.PROJECT_NAME]) ?? '',
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
    formula = `AND(${formula}, FIND("${options.projectId}", ARRAYJOIN({${TASKS.PROJECT}}, ",")))`
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
  return tasks
}

export async function getTaskById(id: string): Promise<Task> {
  const res = await fetchWithRetry(`${BASE_URL}/${BASE_ID}/${TASKS.TABLE_ID}/${id}`, {
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
  const res = await fetchWithRetry(`${BASE_URL}/${BASE_ID}/${TASKS.TABLE_ID}/${id}`, {
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
  const res = await fetchWithRetry(`${BASE_URL}/${BASE_ID}/${TASKS.TABLE_ID}/${id}`, {
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
  let formula: string
  if (itemId) {
    formula = `AND(FIND("${itemId}", ARRAYJOIN({${TASKS.PROJECT_ITEM}}, ",")), {${TASKS.STATUS}}="Locked")`
  } else {
    formula = `AND(FIND("${projectId}", ARRAYJOIN({${TASKS.PROJECT}}, ",")), {${TASKS.STATUS}}="Locked", {${TASKS.PROJECT_ITEM}}=BLANK())`
  }
  const records = await fetchAll(TASKS.TABLE_ID, { filterByFormula: formula })
  return records.map(transformTask)
}

export async function getProjects(options: { stage?: string } = {}): Promise<Project[]> {
  let formula = `NOT(OR({${PROJECTS.PROJECT_STAGE}}="Closed", {${PROJECTS.PROJECT_STAGE}}="Warranty Done"))`
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
  const res = await fetchWithRetry(`${BASE_URL}/${BASE_ID}/${PROJECTS.TABLE_ID}/${id}`, {
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
  const res = await fetchWithRetry(`${BASE_URL}/${BASE_ID}/${PROJECTS.TABLE_ID}/${id}`, {
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

  const res = await fetchWithRetry(`${BASE_URL}/${BASE_ID}/${PAYMENTS.TABLE_ID}`, {
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
  const res = await fetchWithRetry(`${BASE_URL}/${BASE_ID}/${GATE_PASSES.TABLE_ID}`, {
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

  const res = await fetchWithRetry(`${BASE_URL}/${BASE_ID}/${TASKS.TABLE_ID}/${taskId}`, {
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
  const formula = `AND(FIND("${projectId}", ARRAYJOIN({${TASKS.PROJECT}}, ",")), {${TASKS.STATUS}} != "Locked")`
  const records = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: formula,
    sort: [{ field: TASKS.TEMPLATE_ORDER, direction: 'asc' }],
  })
  let tasks = records.map(transformTask)
  tasks = await enrichTasksWithAssigneeNames(tasks)
  return tasks
}

export async function getIncompleteTasksForProject(projectId: string): Promise<Task[]> {
  const formula = `AND(
    FIND("${projectId}", ARRAYJOIN({${TASKS.PROJECT}}, ",")),
    {${TASKS.STATUS}} != "Completed",
    {${TASKS.STATUS}} != "Locked"
  )`
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
  const res = await fetchWithRetry(`${BASE_URL}/${BASE_ID}/${TEAM_MEMBERS.TABLE_ID}`, {
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

  const res = await fetchWithRetry(`${BASE_URL}/${BASE_ID}/${TEAM_MEMBERS.TABLE_ID}/${recordId}`, {
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

export async function getAnnouncements(role?: string): Promise<Announcement[]> {
  const today = new Date().toISOString().slice(0, 10)
  const expiryFilter = `OR({${ANNOUNCEMENTS.EXPIRES_AT}}="", IS_AFTER({${ANNOUNCEMENTS.EXPIRES_AT}}, "${today}"), {${ANNOUNCEMENTS.EXPIRES_AT}}=BLANK())`
  const visibilityFilter = role
    ? `OR({${ANNOUNCEMENTS.VISIBLE_TO}}="All", {${ANNOUNCEMENTS.VISIBLE_TO}}=BLANK(), {${ANNOUNCEMENTS.VISIBLE_TO}}="")`
    : `{${ANNOUNCEMENTS.VISIBLE_TO}}="All"`
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

  const res = await fetchWithRetry(`${BASE_URL}/${BASE_ID}/${ANNOUNCEMENTS.TABLE_ID}`, {
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

  const res = await fetchWithRetry(`${BASE_URL}/${BASE_ID}/${ANNOUNCEMENTS.TABLE_ID}/${id}`, {
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
  const res = await fetchWithRetry(`${BASE_URL}/${BASE_ID}/${MATERIALS_NEEDED.TABLE_ID}/${id}`, {
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

// ─── Calendar data ───────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string
  title: string
  date: string
  type: 'installation' | 'delivery' | 'activity'
  projectId?: string
  projectName?: string
}

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  const [gatePasses, tasks] = await Promise.all([
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

  return events
}
