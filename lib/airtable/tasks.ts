// Tasks domain — all task-related Airtable functions

import { PHASE_CONFIG } from '../phases'
import {
  Role,
  Task,
  TaskStatus,
  TaskUpdateInput,
  AttachmentInput,
  Attachment,
} from '../types'
import { ROLE_TO_DEPARTMENT } from '../permissions'
import { notifyTasksReady } from '../notifications'
import {
  TASKS,
  PROJECTS,
  PROJECT_ITEMS,
  TEAM_MEMBERS,
  TASK_TEMPLATES,
  BASE_URL,
  fetchAll,
  fetchWithRetry,
  airtableHeaders,
  recUrl,
  tblUrl,
  buildUrl,
  RawRecord,
  str,
  strArr,
  selectName,
  lookupSelectNames,
  firstLinkedRecord,
  transformTask,
} from './_client'

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
  installationSchedule: TASKS.INSTALLATION_SCHEDULE,
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
  superadminNote: TASKS.SUPERADMIN_NOTE,
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

// Template orders for on-demand-only tasks (excluded from auto-generation).
// Order 5  = standalone "Take Measurement" (Installation, Preparing) — SED assigns via assign-measurement.
// Order 24 = per-item "Take Measurement " (SED, Open) — same on-demand rationale.
// Order 25 = per-item "Take measurements for item" (Installation) + "Manage It" (Manager), Open phase.
// Order 4 is NOT excluded here: the pathCondition filter handles gateway path choices at that order
// (they must pass through), and there are no path=null templates at order 4.
const SED_EXCLUDED_TEMPLATE_ORDERS = [4, 5, 24, 25]
const GLOBALLY_EXCLUDED_TEMPLATE_ORDERS = [4, 5, 24, 25]

function buildDepartmentFormula(role: Role): string {
  if (role === 'superadmin') {
    return `{${TASKS.STATUS}} != "Locked"`
  }
  const departments = ROLE_TO_DEPARTMENT[role as Exclude<Role, 'superadmin'>]
  const deptChecks = departments
    .map((d) => `FIND("${d}", ARRAYJOIN({${TASKS.DEPARTMENT}}, ","))`)
    .join(', ')
  const deptOr = departments.length > 1 ? `OR(${deptChecks})` : deptChecks

  let base = `AND(${deptOr}, NOT(FIND("Superadmin", ARRAYJOIN({${TASKS.DEPARTMENT}}, ","))), {${TASKS.STATUS}} != "Locked")`

  if (role === 'sed') {
    const excludeOrders = SED_EXCLUDED_TEMPLATE_ORDERS
      .map((n) => `{${TASKS.TEMPLATE_ORDER}} = ${n}`)
      .join(', ')
    // Only exclude the standalone "Take Measurement" task (no path condition) — gateway
    // path choices (Order Sample, Site Visit, Design (item), etc.) share the same order
    // numbers but must remain visible to SED.
    base = `AND(${base}, NOT(AND(OR(${excludeOrders}), {${TASKS.PATH_CONDITION}} = BLANK())))`
  }

  return base
}

// ─── Enrichment helpers ──────────────────────────────────────────────────────

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

  const infoMap: Record<string, { ref: string; name: string; nickname: string | null; quotationNumber: string | null; quotationReference: string | null; salesOwnerName: string | null; communSeds: string[]; requestType: string | null; tradeReference: string | null }> = {}
  const chunks: string[][] = []
  for (let i = 0; i < projectIds.length; i += 10) {
    chunks.push(projectIds.slice(i, i + 10))
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const formula = `OR(${chunk.map((id) => `RECORD_ID()="${id}"`).join(',')})`
      const records = await fetchAll(PROJECTS.TABLE_ID, {
        filterByFormula: formula,
        fields: [PROJECTS.PROJECT_ID, PROJECTS.PROJECT_NAME, PROJECTS.NICKNAME, PROJECTS.QUOTATION_NUMBER, PROJECTS.QUOTATION_REFERENCE, PROJECTS.SALES_OWNER, PROJECTS.COMMUN_SEDS, PROJECTS.REQUEST_TYPE, PROJECTS.TRADE_REFERENCE],
      })
      for (const r of records) {
        const ref = str(r.fields[PROJECTS.PROJECT_ID])
        const name = str(r.fields[PROJECTS.PROJECT_NAME]) ?? ''
        const nickname = str(r.fields[PROJECTS.NICKNAME]) ?? null
        const quotationNumber = str(r.fields[PROJECTS.QUOTATION_NUMBER]) ?? null
        const quotationReference = str(r.fields[PROJECTS.QUOTATION_REFERENCE]) ?? null
        const owner = firstLinkedRecord(r.fields[PROJECTS.SALES_OWNER])
        const rawCommun = r.fields[PROJECTS.COMMUN_SEDS]
        const communRaw: Array<string | { name?: string; id?: string }> = Array.isArray(rawCommun) ? rawCommun : []
        const communSeds = communRaw.map((c) => (typeof c === 'string' ? '' : (c.name ?? ''))).filter(Boolean)
        const requestType = str(r.fields[PROJECTS.REQUEST_TYPE]) ?? null
        const tradeReference = str(r.fields[PROJECTS.TRADE_REFERENCE]) ?? null
        if (ref) infoMap[r.id] = { ref, name, nickname, quotationNumber, quotationReference, salesOwnerName: owner?.name ?? null, communSeds, requestType, tradeReference }
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
            projectSalesOwner: info.salesOwnerName ?? undefined,
            projectCommunSeds: info.communSeds.length > 0 ? info.communSeds : undefined,
            projectRequestType: (info.requestType as 'Trade' | 'Maintenance' | 'Variance' | null) ?? undefined,
            projectTradeReference: info.tradeReference ?? undefined,
          }
        : {}),
    }
  })
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

// ─── Task generation helpers ─────────────────────────────────────────────────

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
      // Airtable returns multipleSelects values as plain strings (not {name} objects) —
      // lookupSelectNames() handles both shapes defensively. Also trim: the "Installation"
      // choice in Airtable has a stray trailing space ("Installation "), which would
      // otherwise silently break every `.department.includes('Installation')` check.
      const dept = lookupSelectNames(f[TASK_TEMPLATES.DEPARTMENT]).map((d) => d.trim())
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

export async function createTasksBatch(
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

// ─── Public API ──────────────────────────────────────────────────────────────

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
        ? (rawCommun as Array<string | { id?: string }>).map((c) => typeof c === 'string' ? c : (c.id ?? '')).filter(Boolean)
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
  const projectFilter = `{${TASKS.PROJECT}} = "${projectId}"`
  const formula = itemId
    ? `AND(${projectFilter}, {${TASKS.STATUS}}="Locked")`
    : `AND(${projectFilter}, {${TASKS.STATUS}}="Locked", {${TASKS.PROJECT_ITEM}}=BLANK())`
  const records = await fetchAll(TASKS.TABLE_ID, { filterByFormula: formula })
  const tasks = records.map(transformTask)
  return itemId ? tasks.filter((t) => t.projectItem?.[0] === itemId) : tasks
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

export async function getProjectAttachments(projectId: string): Promise<Task[]> {
  const formula = `{${TASKS.PROJECT}} = "${projectId}"`
  const records = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: formula,
    fields: [
      TASKS.TASK_NAME,
      TASKS.TASK_DOC_LINKS,
      TASKS.FILLERS_DOC_LINKS,
      TASKS.TASK_DOCUMENTS,
      TASKS.FILLERS_MISSING_ITEMS_LIST,
    ],
  })
  return records.map(transformTask)
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
  const formula = `AND({${TASKS.STATUS}} = "Locked", FIND("Sample Branch:", {${TASKS.TASK_NAME}}) > 0)`
  const records = await fetchAll(TASKS.TABLE_ID, { filterByFormula: formula })
  const tasks = records.map(transformTask)
  return tasks.filter(
    (t) => t.projectRecordId === projectId || t.project?.[0] === projectId,
  )
}

// Order-sample tasks that SED has sent to fabrication to build, and which are not yet
// received/completed. Surfaced as read-only cards on the fabrication dashboard.
export async function getSamplesSentToFab(): Promise<Task[]> {
  const formula = `AND(NOT({${TASKS.SENT_TO_FAB_AT}} = BLANK()), {${TASKS.STATUS}} != "Completed")`
  const records = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: formula,
    sort: [{ field: TASKS.SENT_TO_FAB_AT, direction: 'desc' }],
  })
  let tasks = records.map(transformTask)
  tasks = await enrichTasksWithProjectRef(tasks)
  tasks = await enrichTasksWithProjectItemNames(tasks)
  return tasks
}

export async function checkAndUnlockCallClientTask(projectId: string): Promise<void> {
  const pathDoneFormula = `AND({${TASKS.PROJECT}} = "${projectId}", NOT({${TASKS.PATH_CONDITION}} = BLANK()), {${TASKS.STATUS}} = "Completed")`
  const pathDoneRecords = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: pathDoneFormula,
    fields: [TASKS.STATUS],
  })
  if (pathDoneRecords.length === 0) return

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

  const callFormula = `AND({${TASKS.PROJECT}} = "${projectId}", FIND("Call the Client", {${TASKS.TASK_NAME}}) > 0, {${TASKS.STATUS}} = "Locked")`
  const callRecords = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: callFormula,
    fields: [TASKS.TASK_NAME, TASKS.DEPARTMENT, TASKS.PROJECT_ID],
  })

  if (callRecords.length === 0) return

  await Promise.all(
    callRecords.map((r) => updateTaskRaw(r.id, { [TASKS.STATUS]: 'To Do' })),
  )

  for (const r of callRecords) {
    const rawDepts = r.fields[TASKS.DEPARTMENT]
    const depts: string[] = Array.isArray(rawDepts)
      ? (rawDepts as Array<{ name?: string } | string>).map((d) =>
          typeof d === 'string' ? d : (d.name ?? ''),
        ).filter(Boolean)
      : []
    const taskName = str(r.fields[TASKS.TASK_NAME]) ?? 'Call the Client'
    const projRef = str(r.fields[TASKS.PROJECT_ID]) ?? projectId
    await notifyTasksReady(
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
    new Set(taskRecords.map((r) => str(r.fields[TASKS.PROJECT])).filter((id): id is string => Boolean(id))),
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
    const pid = str(r.fields[TASKS.PROJECT]) ?? ''
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

// For the given projects, return the name of a current active (To Do / In Progress)
// task — i.e. where each project is currently stuck. Used by smarter stale detection.
export async function getStuckTaskForProjects(projectIds: string[]): Promise<Record<string, string>> {
  if (projectIds.length === 0) return {}
  const out: Record<string, string> = {}
  const chunks: string[][] = []
  for (let i = 0; i < projectIds.length; i += 10) chunks.push(projectIds.slice(i, i + 10))
  await Promise.all(
    chunks.map(async (chunk) => {
      const projFilter = chunk.map((id) => `{${TASKS.PROJECT}} = "${id}"`).join(', ')
      const formula = `AND(OR(${projFilter}), OR({${TASKS.STATUS}}="To Do", {${TASKS.STATUS}}="In Progress"))`
      const records = await fetchAll(TASKS.TABLE_ID, {
        filterByFormula: formula,
        fields: [TASKS.TASK_NAME, TASKS.PROJECT],
      })
      for (const r of records) {
        const pid = str(r.fields[TASKS.PROJECT])
        if (pid && !out[pid]) out[pid] = str(r.fields[TASKS.TASK_NAME]) ?? ''
      }
    }),
  )
  return out
}

// Per-department performance over the last 30 days: completed-task count and average
// task duration (started → completed). Powers the superadmin role-performance card.
export async function getRolePerformance(): Promise<
  { department: string; avgHours: number; completed: number }[]
> {
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const formula = `AND({${TASKS.STATUS}}="Completed", NOT({${TASKS.COMPLETED_AT}}=BLANK()), IS_AFTER({${TASKS.COMPLETED_AT}}, "${since30}"))`
  const records = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: formula,
    fields: [TASKS.DEPARTMENT, TASKS.STARTED_AT, TASKS.COMPLETED_AT],
  })
  const agg = new Map<string, { totalHours: number; durationCount: number; completed: number }>()
  for (const r of records) {
    const dept = lookupSelectNames(r.fields[TASKS.DEPARTMENT])[0] ?? 'Other'
    const entry = agg.get(dept) ?? { totalHours: 0, durationCount: 0, completed: 0 }
    entry.completed += 1
    const started = str(r.fields[TASKS.STARTED_AT])
    const completed = str(r.fields[TASKS.COMPLETED_AT])
    if (started && completed) {
      const hours = (new Date(completed).getTime() - new Date(started).getTime()) / (60 * 60 * 1000)
      if (hours >= 0 && hours < 24 * 365) {
        entry.totalHours += hours
        entry.durationCount += 1
      }
    }
    agg.set(dept, entry)
  }
  return Array.from(agg.entries())
    .map(([department, v]) => ({
      department,
      avgHours: v.durationCount > 0 ? Math.round((v.totalHours / v.durationCount) * 10) / 10 : 0,
      completed: v.completed,
    }))
    .sort((a, b) => b.completed - a.completed)
}

export async function getPendingApprovalsCount(): Promise<number> {
  const formula = `{${TASKS.MANAGER_REVIEW_STATUS}} = "Pending"`
  const records = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: formula,
    fields: [TASKS.MANAGER_REVIEW_STATUS],
  })
  return records.length
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

export async function deleteTasksByProjectId(projectId: string): Promise<number> {
  const formula = `{${TASKS.PROJECT}} = "${projectId}"`
  const records = await fetchAll(TASKS.TABLE_ID, { filterByFormula: formula, fields: [TASKS.STATUS] })
  if (records.length === 0) return 0

  let deleted = 0
  for (let i = 0; i < records.length; i += 10) {
    const chunk = records.slice(i, i + 10)
    const qs = chunk.map((r) => `records[]=${r.id}`).join('&')
    const res = await fetchWithRetry(`${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/${TASKS.TABLE_ID}?${qs}`, {
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

// Deletes only per-item tasks (those linked to a project item), leaving Phase-1 /
// universal project-level tasks intact. Used when an F5 quotation is reset so the
// item-derived tasks are cleared before a fresh resubmission.
export async function deletePerItemTasksByProject(projectId: string): Promise<number> {
  const formula = `{${TASKS.PROJECT}} = "${projectId}"`
  const records = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: formula,
    fields: [TASKS.PROJECT_ITEM],
  })
  const perItem = records.filter((r) => {
    const v = r.fields[TASKS.PROJECT_ITEM]
    return Array.isArray(v) ? v.length > 0 : Boolean(v)
  })
  if (perItem.length === 0) return 0

  let deleted = 0
  for (let i = 0; i < perItem.length; i += 10) {
    const chunk = perItem.slice(i, i + 10)
    const qs = chunk.map((r) => `records[]=${r.id}`).join('&')
    const res = await fetchWithRetry(`${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/${TASKS.TABLE_ID}?${qs}`, {
      method: 'DELETE',
      headers: airtableHeaders(),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Airtable error deleting per-item tasks ${res.status}: ${body}`)
    }
    deleted += chunk.length
  }
  return deleted
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
  const lockFormula = `AND({${TASKS.PROJECT}} = "${projectId}", OR({${TASKS.STATUS}}="To Do", {${TASKS.STATUS}}="In Progress", {${TASKS.STATUS}}="Pending Approval"))`
  const toArchive = await fetchAll(TASKS.TABLE_ID, { filterByFormula: lockFormula, fields: [TASKS.STATUS] })
  if (toArchive.length > 0) {
    await Promise.all(toArchive.map((r) => updateTaskRaw(r.id, { [TASKS.STATUS]: 'Locked' as TaskStatus })))
  }

  const fetchedTemplates = await getTaskTemplates(stage)
  if (fetchedTemplates.length === 0) return { created: 0, skipped: 0, todoTemplates: [] }

  const openCfg = PHASE_CONFIG.Open
  const allTemplates = (stage === 'Open'
    ? fetchedTemplates.filter(
        (t) =>
          t.templateOrder !== null &&
          t.templateOrder <= openCfg.projectLevelOrderMax &&
          (t.phaseLabel === null || t.phaseLabel === openCfg.phaseLabel),
      )
    : fetchedTemplates
  ).filter(t => t.templateOrder == null || t.pathCondition !== null || !GLOBALLY_EXCLUDED_TEMPLATE_ORDERS.includes(t.templateOrder))

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
      status = t.taskName === 'Follow Up' ? 'Locked' : 'To Do'
    } else if (t.pathCondition === null) {
      if (firstIsAutoCompleted && t.templateOrder === firstOrder) status = 'Completed'
      else if (t.templateOrder === activeOrder) status = 'To Do'
      else status = 'Locked'
    } else {
      // Sample Branch tasks stay Locked until SED explicitly picks "Send to Fabrication"
      // on the Order Sample task. All other path chips (Make Quotation, Select Sample, etc.)
      // start as To Do so SED can choose them immediately in the gateway.
      const isSampleBranch = t.taskName.toLowerCase().startsWith('sample branch:')
      const pathMin = pathMinMap.get(t.pathCondition)!
      status = (!isSampleBranch && t.templateOrder === pathMin) ? 'To Do' : 'Locked'
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
  // When omitted, every per-item action path defined in the Airtable templates is
  // generated (gateway model). When provided, only those paths are generated
  // (used by the manual "+ Actions" fallback).
  chosenPaths?: string[],
): Promise<{ created: number; todoTemplates: TaskTemplate[] }> {
  const allOpenTemplates = await getTaskTemplates('Open')

  const { perItemOrderMin, phaseLabel } = PHASE_CONFIG.Open
  const itemTemplates = allOpenTemplates.filter(
    (t) =>
      (t.phaseLabel === null || t.phaseLabel === phaseLabel) &&
      (t.templateOrder === null || t.templateOrder >= perItemOrderMin) &&
      (t.pathCondition === null || !chosenPaths || chosenPaths.includes(t.pathCondition)),
  ).filter(t => t.templateOrder == null || t.pathCondition !== null || !GLOBALLY_EXCLUDED_TEMPLATE_ORDERS.includes(t.templateOrder))
  if (itemTemplates.length === 0) return { created: 0, todoTemplates: [] }

  const allProjectItemTasks = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: `{${TASKS.PROJECT}} = "${projectId}"`,
    fields: [TASKS.PATH_CONDITION, TASKS.TASK_TEMPLATES_LINK, TASKS.PROJECT_ITEM],
  })
  const existingRaw = allProjectItemTasks.filter((r) => {
    const pi = r.fields[TASKS.PROJECT_ITEM]
    const ids: string[] = Array.isArray(pi)
      ? (pi as Array<string | { id?: string }>).map((v) => (typeof v === 'string' ? v : (v.id ?? '')))
      : []
    return ids.includes(itemId)
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
      // Sample Branch tasks stay Locked until SED picks "Send to Fabrication"
      // Other path tasks (Make Quotation, Select Sample, etc.) start To Do immediately
      const isSampleBranch = t.taskName.toLowerCase().startsWith('sample branch:')
      status = isSampleBranch ? 'Locked' : 'To Do'
    } else {
      const pathMin = pathMinMap.get(null) ?? Infinity
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

  // Fetch all tasks for this project, then filter by item client-side.
  // ARRAYJOIN on a linked-record field returns primary field values (names), not record IDs,
  // so we cannot reliably filter by itemId inside a formula.
  const existingRaw = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: `FIND("${projectId}", ARRAYJOIN({${TASKS.PROJECT}}))`,
    fields: [TASKS.TASK_TEMPLATES_LINK, TASKS.PROJECT_ITEM],
  })
  const existingTemplateIds = new Set<string>()
  for (const r of existingRaw) {
    const itemIds = strArr(r.fields[TASKS.PROJECT_ITEM])
    if (!itemIds.includes(itemId)) continue
    const links = r.fields[TASKS.TASK_TEMPLATES_LINK]
    if (Array.isArray(links)) links.forEach((id) => existingTemplateIds.add(id as string))
  }
  const newTemplates = templates.filter((t) => !existingTemplateIds.has(t.id))
  if (newTemplates.length === 0) return { created: 0, todoTemplates: [] }

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
  const [closingTemplates, maintTemplates] = await Promise.all([
    getTaskTemplates('Closing'),
    getTaskTemplates('Closed & Valid Maintenance'),
  ])
  const templates = [...closingTemplates, ...maintTemplates].filter(
    (t) => t.templateOrder !== null,
  )
  if (templates.length === 0) return { created: 0, todoTemplates: [] }

  const existingRaw = await fetchAll(TASKS.TABLE_ID, {
    filterByFormula: `FIND("${projectId}", ARRAYJOIN({${TASKS.PROJECT}}))`,
    fields: [TASKS.TASK_TEMPLATES_LINK],
  })
  const existingTemplateIds = new Set<string>()
  for (const r of existingRaw) {
    const links = r.fields[TASKS.TASK_TEMPLATES_LINK]
    if (Array.isArray(links)) links.forEach((id) => existingTemplateIds.add(id as string))
  }
  const newTemplates = templates.filter((t) => !existingTemplateIds.has(t.id))
  if (newTemplates.length === 0) return { created: 0, todoTemplates: [] }

  const minOrder = Math.min(...newTemplates.map((t) => t.templateOrder!))
  const todoTemplates: TaskTemplate[] = []

  const records = newTemplates.map((t) => {
    const status: TaskStatus = t.templateOrder === minOrder ? 'To Do' : 'Locked'
    if (status === 'To Do') todoTemplates.push(t)
    const record: Record<string, unknown> = {
      [TASKS.TASK_NAME]: t.taskName,
      [TASKS.PROJECT]: projectId,
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
