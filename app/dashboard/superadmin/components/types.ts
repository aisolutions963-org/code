// Shared types for the superadmin dashboard

export type Page =
  | 'overview'
  | 'timeline'
  | 'phases'
  | 'activity'
  | 'payments'
  | 'calendar'
  | 'warranty'
  | 'users'
  | 'announcements'
  | 'projects'
  | 'tasks'
  | 'materials'

export interface SedMember { id: string; name: string }

export interface SuperadminMetrics {
  totalProjects: number
  activeProjects: number
  staleProjects: number
  pendingApprovals: number
  overduePayments: number
  totalRevenue: number
  totalPaid: number
  totalRemaining: number
  callClientTasks: { taskId: string; projectRef: string; projectName: string; clientName: string; clientPhone: string }[]
}

export interface KpiCounts {
  total: number
  preparing: number
  open: number
  notApproved: number
  finished: number
  maintenanceActive: number
  finishedUnpaid: number
  maintenanceExpired: number
}

export interface SedStat {
  sedName: string
  preparing: number
  open: number
  closed: number
  notApproved: number
  totalPaid: number
  commission: number
}

export interface WorkHourEntry {
  project: string
  hours: number
}

export type ReportCategory = 'Sales' | 'Accountant' | 'Material' | 'Calendar' | 'Clients'

export interface ReportItem {
  name: string
  description: string
  route: string
}

export interface TimelineProject {
  id: string
  projectId: string
  projectName: string
  clientName: string
  projectStage: string
  projectCreatedAt?: string
  items: Array<{ id: string; title: string; date: string; type: string }>
}

export interface MaintenanceWithExtra {
  id: string
  maintenanceId: string
  warrantyType?: string
  startDate?: string
  endDate?: string
  daysRemaining: number
  projectNames: string[]
}

export interface AnnouncementForm {
  title: string
  message: string
  pinned: boolean
  visibleTo: string
  expiresAt: string
}

export type Dept = 'All' | 'SED' | 'Fabrication' | 'Installation' | 'Management'

export interface TeamTask {
  id: string
  taskName: string
  status: string
  department: string[]
  projectRef: string
  projectRecordId: string
}

export interface TeamGroup {
  name: string
  role: string
  userId: number
  tasks: TeamTask[]
}

export type FollowUpChoice = 'Reject Project' | 'SED to Follow Up' | 'Manager to Follow Up'

export const REPORT_TABS: { category: ReportCategory; color: string; reports: ReportItem[] }[] = [
  {
    category: 'Sales',
    color: 'text-green-700 bg-green-50 border-green-200',
    reports: [
      { name: 'Quotations Pipeline', description: 'All quotes with status, SED, and amounts', route: 'quotations' },
      { name: 'SED Follow-Ups', description: 'Follow-up log with outcomes and next actions', route: 'follow-ups' },
      { name: 'Ongoing Projects', description: 'Per-item production status matrix', route: 'ongoing-projects' },
      { name: 'SED Projects Status', description: 'Project portfolio per SED with quote amounts', route: 'sed-projects' },
      { name: 'Client Requests', description: 'Trade, Maintenance & Variance requests with task progress', route: 'client-requests' },
    ],
  },
  {
    category: 'Accountant',
    color: 'text-red-700 bg-red-50 border-red-200',
    reports: [
      { name: 'Payables', description: 'Supplier invoices and payments owed', route: 'payables' },
      { name: 'Receivables', description: 'Client outstanding balances and old debts', route: 'receivables' },
      { name: 'Quotation Line Items', description: 'Itemised scope and amounts per quotation', route: 'quotation-line-items' },
    ],
  },
  {
    category: 'Material',
    color: 'text-purple-700 bg-purple-50 border-purple-200',
    reports: [
      { name: 'Material Orders', description: 'All procurement orders and delivery status', route: 'material-orders' },
      { name: 'Production Timesheets', description: 'Weekly worker-hour log per project', route: 'timesheets' },
    ],
  },
  {
    category: 'Calendar',
    color: 'text-yellow-700 bg-yellow-50 border-yellow-200',
    reports: [],
  },
  {
    category: 'Clients',
    color: 'text-sky-700 bg-sky-50 border-sky-200',
    reports: [],
  },
]
