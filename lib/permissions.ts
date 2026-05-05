import { Role, TaskUpdateInput } from './types'

export const EDITABLE_FIELDS: Record<Role, (keyof TaskUpdateInput)[]> = {
  installation: [
    'status',
    'teamDaysRequired',
    'noOfLaborsPerDay',
    'installationDays',
    'taskDocuments',
    'fillersAndMissingList',
    'handoverDocument',
    'completionDate',
    'qcCheckAtSiteDone',
    'fillersDone',
  ],
  sed: [
    'status',
    'postVisitOutcome',
    'taskStartDate',
    'conceptDesignApproval',
    'sampleApproval',
    'quotationOutcome',
    'taskDocuments',
  ],
  fabrication: [
    'status',
    'fabricationPath',
    'postCarpentryPath',
    'plannedProdStartDate',
    'expectedFabEndDate',
    'taskDocuments',
  ],
  manager: [
    'status',
    'managerReviewStatus',
    'managerComment',
    'completionDate',
    'taskDocuments',
    'priorityFlag',
  ],
  superadmin: Object.keys({} as TaskUpdateInput) as (keyof TaskUpdateInput)[],
}

const ALL_TASK_UPDATE_KEYS: (keyof TaskUpdateInput)[] = [
  'status',
  'managerReviewStatus',
  'managerComment',
  'postVisitOutcome',
  'taskStartDate',
  'completionDate',
  'startedAt',
  'completedAt',
  'teamDaysRequired',
  'noOfLaborsPerDay',
  'installationDays',
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
  'handoverDocument',
  'fillersAndMissingList',
  'requiresManagerReviewManually',
  'priorityFlag',
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
  sed: ['SED'],
  fabrication: ['Fabrication'],
  manager: ['Manager', 'Purchase'],
}
