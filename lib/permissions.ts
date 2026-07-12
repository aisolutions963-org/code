import { Role, TaskStatus, TaskUpdateInput } from './types'
import { isAutoTask } from './phases'

export const EDITABLE_FIELDS: Record<Role, (keyof TaskUpdateInput)[]> = {
  installation: [
    'status',
    'teamDaysRequired',
    'noOfLaborsPerDay',
    'installationDays',
    'installationSchedule',
    'taskDocLinks',
    'fillersDocLinks',
    'completionDate',
    'qcCheckAtSiteDone',
    'fillersDone',
    'installationNote',
  ],
  sed: [
    'status',
    'postVisitOutcome',
    'taskStartDate',
    'conceptDesignApproval',
    'sampleApproval',
    'quotationOutcome',
    'taskDocLinks',
    'callCount',
    'sedNote',
  ],
  fabrication: [
    'status',
    'fabricationPath',
    'postCarpentryPath',
    'plannedProdStartDate',
    'expectedFabEndDate',
    'taskDocLinks',
  ],
  manager: [
    'status',
    'managerComment',
    'completionDate',
    'taskStartDate',
    'plannedProdStartDate',
    'expectedFabEndDate',
    'taskDocLinks',
    'priorityFlag',
    'teamDaysRequired',
    'noOfLaborsPerDay',
    'installationSchedule',
  ],
  superadmin: Object.keys({} as TaskUpdateInput) as (keyof TaskUpdateInput)[],
}

const ALL_TASK_UPDATE_KEYS: (keyof TaskUpdateInput)[] = [
  'status',
  'managerComment',
  'postVisitOutcome',
  'taskStartDate',
  'completionDate',
  'startedAt',
  'completedAt',
  'teamDaysRequired',
  'noOfLaborsPerDay',
  'installationDays',
  'installationSchedule',
  'plannedProdStartDate',
  'expectedFabEndDate',
  'fabricationPath',
  'postCarpentryPath',
  'productionStartPath',
  'conceptDesignApproval',
  'sampleApproval',
  'quotationOutcome',
  'qcCheckAtSiteDone',
  'fillersDone',
  'taskDocuments',
  'fillersAndMissingList',
  'priorityFlag',
  'sedNote',
  'superadminNote',
  'callCount',
  'followUpOutcome',
  'taskDocLinks',
  'fillersDocLinks',
  'installationNote',
]

EDITABLE_FIELDS.superadmin = ALL_TASK_UPDATE_KEYS

export function canEditField(role: Role, field: string): boolean {
  if (role === 'superadmin') return true
  return (EDITABLE_FIELDS[role] as string[]).includes(field)
}

export function filterAllowedFields(
  role: Role,
  fields: Partial<TaskUpdateInput>,
): Partial<TaskUpdateInput> {
  if (role === 'superadmin') return fields
  const allowed = EDITABLE_FIELDS[role] as string[]
  return Object.fromEntries(
    Object.entries(fields).filter(([k]) => allowed.includes(k)),
  ) as Partial<TaskUpdateInput>
}

export const ROLE_TO_DEPARTMENT: Record<Exclude<Role, 'superadmin'>, string[]> = {
  installation: ['Installation'],
  fabrication: ['Fabrication'],
  sed: ['SED', 'Fabrication', 'Installation'],
  manager: ['Manager', 'Purchase', 'Mix', 'SED', 'Fabrication', 'Installation'],
}

// A task is "actionable" (should glow green) when the current role can act on it now.
// System/auto tasks never belong to a user. Managers additionally act on approvals.
// The task feed is already department-filtered server-side, so status is the main signal.
export function isActionableTask(
  task: { status: TaskStatus; taskName: string },
  role: Role,
): boolean {
  if (isAutoTask(task.taskName)) return false
  if (task.status === 'To Do' || task.status === 'In Progress') return true
  if (role === 'manager' && task.status === 'Pending Approval') return true
  return false
}
