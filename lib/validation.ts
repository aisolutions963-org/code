import { z } from 'zod'

export const LoginSchema = z.object({
  email: z.string().email().max(255).transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8).max(128),
})

export const CreateUserSchema = z.object({
  name: z.string().min(1).max(100).transform((v) => v.trim()),
  email: z.string().email().max(255).transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8).max(128),
  role: z.enum(['superadmin', 'manager', 'sed', 'fabrication', 'installation']),
  airtable_member_id: z.string().optional(),
})

export const UpdateUserSchema = z.object({
  name: z.string().min(1).max(100).transform((v) => v.trim()).optional(),
  email: z.string().email().max(255).transform((v) => v.toLowerCase().trim()).optional(),
  password: z.string().min(8).max(128).optional(),
  role: z.enum(['superadmin', 'manager', 'sed', 'fabrication', 'installation']).optional(),
  active: z.number().int().min(0).max(1).optional(),
})

export const UpdateTaskSchema = z.object({
  status: z.enum(['To Do', 'In Progress', 'Completed', 'Locked', 'Pending Approval']).optional(),
  managerReviewStatus: z.enum(['Not Needed', 'Pending', 'Approved', 'Rejected']).optional(),
  managerComment: z.string().max(2000).optional(),
  postVisitOutcome: z.string().max(500).optional(),
  taskStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  completionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  teamDaysRequired: z.number().int().min(1).max(365).optional(),
  noOfLaborsPerDay: z.number().int().min(1).max(100).optional(),
  installationDays: z.number().int().min(0).max(365).optional(),
  plannedProdStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expectedFabEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fabricationPath: z.string().max(100).optional(),
  postCarpentryPath: z.string().max(100).optional(),
  productionStartPath: z.string().max(100).optional(),
  conceptDesignApproval: z.string().max(100).optional(),
  sampleApproval: z.string().max(100).optional(),
  quotationOutcome: z.string().max(100).optional(),
  qcCheckAtSiteDone: z.boolean().optional(),
  fillersDone: z.boolean().optional(),
  priorityFlag: z.boolean().optional(),
  requiresManagerReviewManually: z.boolean().optional(),
  callCount: z.number().int().min(0).max(10).optional(),
  sedNote: z.string().max(2000).optional(),
  superadminNote: z.string().max(2000).optional(),
  followUpOutcome: z.enum(['Reject Project', 'SED to Follow Up', 'Manager to Follow Up']).optional(),
  taskDocuments: z.array(z.object({ url: z.string().url().optional(), filename: z.string().max(255) })).optional(),
  fillersAndMissingList: z.array(z.object({ url: z.string().url().optional(), filename: z.string().max(255) })).optional(),
  taskDocLinks: z.array(z.object({ url: z.string().url().or(z.literal('')).optional(), label: z.string().min(1).max(255), notes: z.string().max(2000).optional() })).optional(),
  fillersDocLinks: z.array(z.object({ url: z.string().url().or(z.literal('')).optional(), label: z.string().min(1).max(255), notes: z.string().max(2000).optional() })).optional(),
})

export const CreatePaymentSchema = z.object({
  project: z.array(z.string().min(1)).min(1),
  amount: z.number().positive().max(10_000_000),
  paymentType: z.enum(['Advance', 'Delivery', 'Material', 'Final', 'Progressive Payment']),
  paymentStatus: z.enum(['Received', 'Pending', 'Overdue']),
  paymentMethod: z.enum(['Bank Transfer', 'Cash', 'Cheque']),
  referenceNo: z.string().max(100).optional(),
  receivedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  stageAtPayment: z.string().max(100).optional(),
  payerType: z.enum(['Broker', 'Contractor', 'End User', 'Designer']).optional(),
  payerName: z.string().max(200).optional(),
  commissionAmount: z.number().min(0).max(10_000_000).optional(),
  notes: z.string().max(2000).optional(),
})

export const CreateAnnouncementSchema = z.object({
  title: z.string().min(1).max(200).transform((v) => v.trim()),
  message: z.string().max(5000).optional(),
  pinned: z.boolean().optional(),
  visibleTo: z.string().max(100).optional(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export const UpdateAnnouncementSchema = CreateAnnouncementSchema.partial()

export const AssignInstallationSchema = z.object({
  teamMemberIds: z.array(z.string()).max(20),
  itemName: z.string().max(300).optional(),
  itemId: z.string().optional(),
})

export const MaterialDecisionSchema = z.object({
  orderStatus: z.enum(['Not ordered', 'Pending approval', 'Ordered', 'Partially received', 'Received', 'Delayed']),
})

export const CreateQuotationItemsSchema = z.object({
  quotationNumber: z.string().min(1, 'Quotation number is required').regex(/^\d{4,}$/, 'Quotation number must be at least 4 digits').max(100).transform((v) => v.trim()),
  quotationReference: z.string().min(1, 'Quotation reference is required').max(100).transform((v) => v.trim()),
  quotationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid quotation date'),
  items: z
    .array(
      z.object({
        itemName: z.string().min(1, 'Item name is required').max(300).transform((v) => v.trim()),
        description: z.string().min(1, 'Item description is required').max(2000),
        quantity: z.number().int().min(1).max(9999),
        unitPrice: z.number().min(0).max(10_000_000),
        notes: z.string().max(2000).optional(),
        actions: z
          .array(
            z.enum([
              'Site Visit (item)',
              'Select Sample (item)',
              'Design (item)',
              'Measurement (item)',
            ]),
          )
          .min(1, 'Select at least one action for each item'),
      }),
    )
    .min(1, 'At least one item is required')
    .max(50),
  totalAmountToPay: z.number().min(0).max(100_000_000).optional(),
})

export const CreateMaterialsSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(300).transform((v) => v.trim()),
        supplier: z.string().max(200).optional(),
        quantity: z.number().positive().max(100_000).optional(),
        unit: z.enum(['m²', 'm', 'pcs', 'kg', 'set', 'box', 'roll']).optional(),
        unitCost: z.number().min(0).max(10_000_000).optional(),
        expectedArrivalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        notes: z.string().max(2000).optional(),
      }),
    )
    .min(1, 'At least one item is required')
    .max(50),
})

export const CreateMaterialOrderSchema = z
  .object({
    purpose: z.enum(['Project', 'Office', 'Factory', 'Cars', 'Other']),
    projectId: z.string().optional(),
    items: z
      .array(
        z.object({
          name: z.string().min(1).max(300).transform((v) => v.trim()),
          supplier: z.string().max(200).optional(),
          quantity: z.number().positive().max(100_000),
          unit: z.enum(['pcs', 'm', 'm²', 'kg', 'set', 'box', 'roll']),
          neededByDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          notes: z.string().max(2000).optional(),
        }),
      )
      .min(1, 'At least one material row is required')
      .max(50),
  })
  .refine((d) => d.purpose !== 'Project' || !!d.projectId, {
    message: 'Project is required when purpose is Project',
    path: ['projectId'],
  })

export const CreateHandoverSchema = z.object({
  finalInstallationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  customerSatisfaction: z.enum(['Very Satisfied', 'Satisfied', 'Neutral', 'Unsatisfied']),
  installationDifficulty: z.enum(['Easy', 'Medium', 'Hard', 'Very Hard']),
  newsletterOptIn: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
})

export const CreatePurchaseOrderSchema = z.object({
  project: z.array(z.string().min(1)).min(1),
  supplier: z.string().min(1).max(200).transform((v) => v.trim()),
  totalAmount: z.number().min(0).max(100_000_000).optional(),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expectedDelivery: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(2000).optional(),
})

export const CreateInstallationLogSchema = z.object({
  project: z.array(z.string().min(1)).min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  installationTeam: z.enum(['Engr. Abdulkarim', 'Mr. Al Mahdi', 'Mr. Yahia']).optional(),
  numberOfLaborers: z.number().int().min(1).max(100).optional(),
  workDescription: z.string().max(5000).optional(),
  expectedFinishDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export const CreateCalendarEventSchema = z.object({
  title: z.string().min(1).max(200).transform((v) => v.trim()),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  notes: z.string().max(2000).optional(),
  projectId: z.string().optional(),
  customTask: z.string().max(500).optional(),
  eventType: z.enum(['activity', 'installation', 'fabrication', 'delivery']).optional(),
  teamMemberIds: z.array(z.string()).optional(),
})

export const CreateProjectSchema = z.object({
  projectName: z.string().min(1).max(200).transform((v) => v.trim()),
  nickname: z.string().min(1).max(100).transform((v) => v.trim()),
  clientName: z.string().min(1).max(200).transform((v) => v.trim()),
  projectDescription: z.string().min(1).max(5000),
  detailedLocation: z.string().min(1).max(1000),
  paymentMode: z.enum(['Standard', 'Progressive']),

  clientPhone: z.string().max(30).optional(),
  emirate: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
  sedNotes: z.string().max(5000).optional(),
  salesOwnerCollaboratorId: z.string().optional(),
  communSedIds: z.array(z.string().min(1)).max(10).optional(),
})
