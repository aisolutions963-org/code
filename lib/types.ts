export type Role = 'installation' | 'sed' | 'fabrication' | 'manager' | 'superadmin'

export type TaskStatus =
  | 'To Do'
  | 'In Progress'
  | 'Completed'
  | 'Locked'
  | 'Pending Approval'

export type ManagerReviewStatus = 'Not Needed' | 'Pending' | 'Approved' | 'Rejected'

export interface Attachment {
  id: string
  url: string
  filename: string
  size?: number
  type?: string
}

export interface AttachmentInput {
  url: string
  filename: string
  id?: string
}

export interface Task {
  id: string
  taskName: string
  status: TaskStatus
  department: string[]
  taskOrder: number[]
  templateOrder: number[]
  projectId?: string
  project?: string[]
  projectItem?: string[]
  taskDocuments?: Attachment[]
  handoverDocument?: Attachment[]
  fillersAndMissingList?: Attachment[]
  instructions?: string[]
  arabicInstructions?: string[]
  managerReviewStatus?: ManagerReviewStatus
  managerComment?: string
  requiresManagerReview?: boolean[]
  requiresManagerReviewManually?: boolean
  postVisitOutcome?: string
  taskStartDate?: string
  completionDate?: string
  startedAt?: string
  completedAt?: string
  estimatedDuration?: number
  teamDaysRequired?: number
  noOfLaborsPerDay?: number
  installationDays?: number
  plannedProdStartDate?: string
  expectedFabEndDate?: string
  fabricationPath?: string
  postCarpentryPath?: string
  productionStartPath?: string
  conceptDesignApproval?: string
  sampleApproval?: string
  quotationOutcome?: string
  qcCheckAtSiteDone?: boolean
  fillersDone?: boolean
  priorityFlag?: boolean
  projectStage?: string[]
  client?: string[]
  taskCreated?: string
  clientPhone?: string
  projectItemName?: string
  assignedTo?: string[]
  assigneeName?: string
}

export interface TaskUpdateInput {
  status?: TaskStatus
  managerReviewStatus?: ManagerReviewStatus
  managerComment?: string
  postVisitOutcome?: string
  taskStartDate?: string
  completionDate?: string
  startedAt?: string
  completedAt?: string
  teamDaysRequired?: number
  noOfLaborsPerDay?: number
  installationDays?: number
  plannedProdStartDate?: string
  expectedFabEndDate?: string
  fabricationPath?: string
  postCarpentryPath?: string
  productionStartPath?: string
  conceptDesignApproval?: string
  sampleApproval?: string
  quotationOutcome?: string
  qcCheckAtSiteDone?: boolean
  fillersDone?: boolean
  taskDocuments?: AttachmentInput[]
  handoverDocument?: AttachmentInput[]
  fillersAndMissingList?: AttachmentInput[]
  requiresManagerReviewManually?: boolean
  priorityFlag?: boolean
}

export interface Project {
  id: string
  projectName: string
  projectId: string
  projectStage: string
  clientName: string
  salesOwner?: { id: string; email: string; name: string }
  paymentMode?: string
  projectTotalCost?: number
  totalPaid?: number
  remainingBalance?: number
  paymentProgress?: number
  lastModifiedTasks?: string
  approvalStatus?: string
  taskIds?: string[]
  projectItemIds?: string[]
  paymentIds?: string[]
  gatePassIds?: string[]
  managerNotes?: string
  sedNotes?: string
  projectCreatedAt?: string
  clientPhone?: string
  assignedInstallationTeam?: string[]
}

export interface ProjectWithDetails extends Project {
  tasks?: Task[]
  payments?: Payment[]
  gatePasses?: GatePass[]
}

export interface Payment {
  id: string
  name: string
  project: string[]
  amount: number
  paymentType: string
  paymentStatus: string
  paymentMethod: string
  referenceNo?: string
  receivedDate?: string
  dueDate?: string
  accountantApproved?: boolean
  stageAtPayment?: string
}

export interface PaymentCreateInput {
  project: string[]
  amount: number
  paymentType: string
  paymentStatus: string
  paymentMethod: string
  referenceNo?: string
  receivedDate?: string
  dueDate?: string
  stageAtPayment?: string
}

export interface GatePass {
  id: string
  name: string
  project: string[]
  itemsDescription: string
  estimatedSupplyDate: string
  confirmedDeliveryDate?: string
  gatePassStatus?: string
  siteReady?: boolean
  clientNotified?: boolean
}

export interface GatePassCreateInput {
  project: string[]
  itemsDescription: string
  estimatedSupplyDate: string
  confirmedDeliveryDate?: string
}

export interface MaintenanceRecord {
  id: string
  maintenanceId: string
  projects?: string[]
  status: string
  startDate: string
  endDate: string
  warrantyType?: string
}

export interface Announcement {
  id: string
  title: string
  message?: string
  pinned?: boolean
  visibleTo?: string
  expiresAt?: string
}

export interface AnnouncementCreateInput {
  title: string
  message?: string
  pinned?: boolean
  visibleTo?: string
  expiresAt?: string
}

export interface Material {
  id: string
  name: string
  projects?: string[]
  supplier?: string
  quantity?: number
  unit?: string
  unitCost?: number
  orderStatus?: string
  expectedArrivalDate?: string
  actualArrivalDate?: string
  notes?: string
}

// Session payload stored in JWT cookie
export interface SessionPayload {
  id: number
  name: string
  email: string
  role: Role
  iat?: number
  exp?: number
}
