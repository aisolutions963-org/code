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
  url?: string
  filename: string
  id?: string
}

export interface DocLink {
  url?: string
  label: string
  notes?: string
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
  lastModified?: string
  clientPhone?: string
  projectItemName?: string
  assignedTo?: string[]
  assigneeName?: string
  callCount?: number
  sedNote?: string
  superadminNote?: string
  followUpOutcome?: string
  pathCondition?: string
  projectRef?: string
  projectRecordId?: string
  projectName?: string
  projectNickname?: string
  projectQuotationNumber?: string
  projectQuotationReference?: string
  taskDocLinks?: DocLink[]
  fillersDocLinks?: DocLink[]
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
  fillersAndMissingList?: AttachmentInput[]
  requiresManagerReviewManually?: boolean
  priorityFlag?: boolean
  callCount?: number
  sedNote?: string
  superadminNote?: string
  followUpOutcome?: string
  taskDocLinks?: DocLink[]
  fillersDocLinks?: DocLink[]
}

export interface Client {
  id: string
  clientId?: string
  clientName: string
  phone?: string
  email?: string
  projectCount?: number
}

export interface Project {
  id: string
  projectName: string
  nickname?: string
  projectId: string
  quotationNumber?: string
  quotationReference?: string
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
  emirate?: string
  location?: string
  detailedLocation?: string
  projectDescription?: string
  communSeds?: string[]
  communSedIds?: string[]
  fabricationActive?: boolean
}

export interface ProjectCreateInput {
  projectName: string
  clientName: string
  nickname: string
  projectDescription: string
  detailedLocation: string
  paymentMode: string

  clientPhone?: string
  emirate?: string
  location?: string
  sedNotes?: string
  salesOwnerCollaboratorId?: string
  communSedIds?: string[]
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
  payerType?: string
  payerName?: string
  commissionAmount?: number
  notes?: string
  recordedBy?: string
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
  payerType?: string
  payerName?: string
  commissionAmount?: number
  notes?: string
  recordedBy?: string
}

export interface GatePassPrintPayload {
  _v: 1
  timeOfIssue?: string
  timeAmPm?: string
  passValidity?: string
  driverName?: string
  driverIdLicense?: string
  driverContact?: string
  transportCompany?: string
  vehicleModel?: string
  vehiclePlate?: string
  invoiceDoNumber?: string
  items?: { description: string; quantity: string; unit: string; condition: string }[]
  customerName?: string
  deliveryAddress?: string
  customerContact?: string
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
  projectName?: string
  projectDisplayId?: string
  printData?: GatePassPrintPayload
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
  purpose?: string
  requestedBy?: string
  requestDate?: string
}

export interface MaterialCreateInput {
  name: string
  supplier?: string
  quantity?: number
  unit?: string
  unitCost?: number
  expectedArrivalDate?: string
  notes?: string
}

export interface MaterialRowInput {
  name: string
  supplier?: string
  quantity: number
  unit: string
  neededByDate?: string
  notes?: string
}

export interface MaterialOrderInput {
  purpose: string
  projectId?: string
  projectItemId?: string
  requestedBy: string
  requestDate: string
  items: MaterialRowInput[]
}

export interface PurchaseOrder {
  id: string
  name: string
  project: string[]
  supplier?: string
  totalAmount?: number
  poStatus?: string
  orderDate?: string
  expectedDelivery?: string
  actualDelivery?: string
  managerApproved?: boolean
  notes?: string
  recordedBy?: string
}

export interface PurchaseOrderCreateInput {
  project: string[]
  supplier: string
  totalAmount?: number
  orderDate?: string
  expectedDelivery?: string
  notes?: string
  recordedBy?: string
}

export interface InstallationLog {
  id: string
  name: string
  project: string[]
  date: string
  installationTeam?: string
  numberOfLaborers?: number
  workDescription?: string
  expectedFinishDate?: string
  recordedBy?: string
}

export interface InstallationLogCreateInput {
  project: string[]
  date: string
  installationTeam?: string
  numberOfLaborers?: number
  workDescription?: string
  expectedFinishDate?: string
  recordedBy?: string
}

export interface HandoverSheet {
  id: string
  handoverId?: string
  project: string[]
  status: string
  notes?: string
  finalInstallationDate?: string
  customerSatisfaction?: string
  installationDifficulty?: string
  newsletterOptIn?: boolean
  recordedBy?: string
}

export interface ProjectItem {
  id: string
  itemName: string
  itemId: string
  project: string[]
  status?: string
  quantity?: number
  itemCreatedAt?: string
}

export interface Quotation {
  id: string
  name: string
  project: string[]
  projectItem: string[]
  description?: string
  quantity?: number
  unitPrice?: number
  quotationStatus?: string
  notes?: string
  sentDate?: string
  approvedDate?: string
  recordedBy?: string
}

export interface QuotationItemInput {
  itemTypeId: string
  itemTypeName: string
  quantity: number
  unitPrice: number
  description?: string
  notes?: string
}

export interface WorkerCreateInput {
  name: string
  fullName?: string
  nickname?: string
  role?: string
  active?: boolean
}

export interface WorkerUpdateInput {
  name?: string
  fullName?: string
  nickname?: string
  role?: string
  active?: boolean
}

export interface TimesheetEntry {
  id: string
  entryLabel?: string
  workDate: string
  workerIds: string[]
  workerName?: string
  projectIds: string[]
  projectRef?: string
  projectName?: string
  regularHours: number
  overtimeHours: number
  totalHours: number
  notes?: string
}

export interface CreateTimesheetInput {
  workDate: string
  workerIds: string[]
  projectIds: string[]
  regularHours: number
  overtimeHours?: number
  notes?: string
}

export interface UpdateTimesheetInput {
  regularHours?: number
  overtimeHours?: number
  notes?: string
}

export interface TimesheetFilters {
  from?: string
  to?: string
  workerId?: string
  projectId?: string
}

export interface WorkerOption {
  id: string
  name: string
  fullName?: string
  nickname?: string
  role?: string
  active?: boolean
}

export interface WeeklySummary {
  weekStart: string
  weekEnd: string
  workers: WeeklySummaryWorker[]
}

export interface WeeklySummaryWorker {
  workerId: string
  workerName: string
  days: WeeklySummaryDay[]
  totalRegular: number
  totalOvertime: number
  totalHours: number
}

export interface WeeklySummaryDay {
  date: string
  regularHours: number
  overtimeHours: number
  totalHours: number
  projectRef?: string
  entryId: string
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
