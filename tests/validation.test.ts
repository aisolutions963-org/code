import { describe, it, expect } from 'vitest'
import {
  CreatePaymentSchema,
  UpdatePaymentSchema,
  CreateProjectSchema,
  CreateClientRequestSchema,
  LoginSchema,
  CreateUserSchema,
  UpdateUserSchema,
  CreateAnnouncementSchema,
  CreateQuotationItemsSchema,
  CreateMaterialsSchema,
  CreateMaterialOrderSchema,
  CreateHandoverSchema,
  CreateInstallationLogSchema,
  CreatePurchaseOrderSchema,
  CreateCalendarEventSchema,
} from '@/lib/validation'

// ── CreatePaymentSchema ─────────────────────────────────────────────────────

describe('CreatePaymentSchema', () => {
  const base = {
    project: ['recABC123'],
    amount: 5000,
    paymentType: 'Advance',
    paymentStatus: 'Received',
    paymentMethod: 'Bank Transfer',
  }

  it('accepts a minimal valid payment', () => {
    expect(CreatePaymentSchema.safeParse(base).success).toBe(true)
  })

  it('accepts a full valid payment', () => {
    const full = {
      ...base,
      referenceNo: 'REF-001',
      receivedDate: '2026-06-01',
      dueDate: '2026-07-01',
      stageAtPayment: 'Phase 2',
      payerType: 'Broker',
      payerName: 'Ali Trading',
      commissionAmount: 500,
      notes: 'First tranche',
    }
    expect(CreatePaymentSchema.safeParse(full).success).toBe(true)
  })

  it('rejects amount = 0', () => {
    expect(CreatePaymentSchema.safeParse({ ...base, amount: 0 }).success).toBe(false)
  })

  it('rejects amount exceeding 10,000,000', () => {
    expect(CreatePaymentSchema.safeParse({ ...base, amount: 10_000_001 }).success).toBe(false)
  })

  it('rejects invalid paymentType', () => {
    expect(CreatePaymentSchema.safeParse({ ...base, paymentType: 'Deposit' }).success).toBe(false)
  })

  it('rejects Cancelled as paymentStatus (only allowed on update)', () => {
    expect(CreatePaymentSchema.safeParse({ ...base, paymentStatus: 'Cancelled' }).success).toBe(false)
  })

  it('rejects empty project array', () => {
    expect(CreatePaymentSchema.safeParse({ ...base, project: [] }).success).toBe(false)
  })

  it('rejects malformed receivedDate', () => {
    expect(CreatePaymentSchema.safeParse({ ...base, receivedDate: '01-06-2026' }).success).toBe(false)
  })

  it('accepts all valid paymentType values', () => {
    const types = ['Advance', 'Delivery', 'Material', 'Final', 'Progressive Payment']
    types.forEach((t) => {
      expect(CreatePaymentSchema.safeParse({ ...base, paymentType: t }).success).toBe(true)
    })
  })
})

// ── UpdatePaymentSchema ─────────────────────────────────────────────────────

describe('UpdatePaymentSchema', () => {
  it('accepts partial update with one field', () => {
    expect(UpdatePaymentSchema.safeParse({ amount: 1000 }).success).toBe(true)
  })

  it('accepts Cancelled as paymentStatus', () => {
    expect(UpdatePaymentSchema.safeParse({ paymentStatus: 'Cancelled' }).success).toBe(true)
  })

  it('rejects empty object (at least one field required)', () => {
    const result = UpdatePaymentSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects invalid paymentMethod', () => {
    expect(UpdatePaymentSchema.safeParse({ paymentMethod: 'Crypto' }).success).toBe(false)
  })

  it('accepts updating multiple fields', () => {
    expect(
      UpdatePaymentSchema.safeParse({
        amount: 2500,
        paymentStatus: 'Overdue',
        notes: 'Follow up needed',
      }).success,
    ).toBe(true)
  })

  it('rejects negative commissionAmount', () => {
    expect(UpdatePaymentSchema.safeParse({ commissionAmount: -1 }).success).toBe(false)
  })
})

// ── CreateProjectSchema ─────────────────────────────────────────────────────

describe('CreateProjectSchema', () => {
  const base = {
    projectName: 'Villa Renovation',
    projectDescription: 'Full interior woodwork for 4BR villa',
  }

  it('accepts minimal valid project', () => {
    expect(CreateProjectSchema.safeParse(base).success).toBe(true)
  })

  it('trims projectName whitespace', () => {
    const result = CreateProjectSchema.safeParse({ ...base, projectName: '  Villa  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.projectName).toBe('Villa')
  })

  it('rejects empty projectName', () => {
    expect(CreateProjectSchema.safeParse({ ...base, projectName: '' }).success).toBe(false)
  })

  it('rejects missing projectDescription', () => {
    expect(CreateProjectSchema.safeParse({ projectName: 'X' }).success).toBe(false)
  })

  it('accepts optional fields', () => {
    const full = {
      ...base,
      nickname: 'Villa A',
      clientName: 'Mohammed Al Hamdan',
      clientPhone: '+971501234567',
      emirate: 'Dubai',
      location: 'Jumeirah',
      sedNotes: 'Client prefers oak',
    }
    expect(CreateProjectSchema.safeParse(full).success).toBe(true)
  })

  it('rejects communSedIds exceeding 10 entries', () => {
    const ids = Array.from({ length: 11 }, (_, i) => `rec${i}`)
    expect(CreateProjectSchema.safeParse({ ...base, communSedIds: ids }).success).toBe(false)
  })
})

// ── CreateClientRequestSchema ───────────────────────────────────────────────

describe('CreateClientRequestSchema', () => {
  it('accepts valid Trade request with parentProjectId', () => {
    const input = {
      requestType: 'Trade',
      clientName: 'Sara Al Mansoori',
      parentProjectId: 'recXYZ',
    }
    expect(CreateClientRequestSchema.safeParse(input).success).toBe(true)
  })

  it('accepts valid Maintenance request with parentProjectId', () => {
    const input = {
      requestType: 'Maintenance',
      clientName: 'Ahmed Khalil',
      parentProjectId: 'recWARRANTY',
    }
    expect(CreateClientRequestSchema.safeParse(input).success).toBe(true)
  })

  it('rejects Maintenance request without parentProjectId (must link to project under warranty)', () => {
    const input = {
      requestType: 'Maintenance',
      clientName: 'Ahmed Khalil',
    }
    const result = CreateClientRequestSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects Trade request without parentProjectId', () => {
    const input = {
      requestType: 'Trade',
      clientName: 'Sara Al Mansoori',
    }
    const result = CreateClientRequestSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects empty clientName', () => {
    expect(
      CreateClientRequestSchema.safeParse({
        requestType: 'Maintenance',
        clientName: '',
        parentProjectId: 'recX',
      }).success,
    ).toBe(false)
  })

  it('rejects invalid requestType', () => {
    expect(
      CreateClientRequestSchema.safeParse({
        requestType: 'Repair',
        clientName: 'Test',
      }).success,
    ).toBe(false)
  })

  it('trims clientName whitespace', () => {
    const result = CreateClientRequestSchema.safeParse({
      requestType: 'Maintenance',
      clientName: '  Ahmed  ',
      parentProjectId: 'recWARRANTY',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.clientName).toBe('Ahmed')
  })
})

// ── LoginSchema ─────────────────────────────────────────────────────────────

describe('LoginSchema', () => {
  it('accepts valid credentials', () => {
    expect(LoginSchema.safeParse({ email: 'user@example.com', password: 'secret99' }).success).toBe(true)
  })

  it('normalises email to lowercase', () => {
    const result = LoginSchema.safeParse({ email: 'USER@Example.COM', password: 'secret99' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.email).toBe('user@example.com')
  })

  it('rejects invalid email', () => {
    expect(LoginSchema.safeParse({ email: 'notanemail', password: 'secret99' }).success).toBe(false)
  })

  it('rejects password shorter than 8 chars', () => {
    expect(LoginSchema.safeParse({ email: 'a@b.com', password: 'short' }).success).toBe(false)
  })
})

// ── CreateUserSchema ────────────────────────────────────────────────────────

describe('CreateUserSchema', () => {
  const base = {
    name: 'Sahar',
    email: 'sahar@woodwings.ae',
    password: 'securepass',
    role: 'manager',
  }

  it('accepts valid user', () => {
    expect(CreateUserSchema.safeParse(base).success).toBe(true)
  })

  it('rejects invalid role', () => {
    expect(CreateUserSchema.safeParse({ ...base, role: 'guest' }).success).toBe(false)
  })

  it('accepts all valid roles', () => {
    const roles = ['superadmin', 'manager', 'sed', 'fabrication', 'installation']
    roles.forEach((r) => {
      expect(CreateUserSchema.safeParse({ ...base, role: r }).success).toBe(true)
    })
  })

  it('rejects name longer than 100 chars', () => {
    expect(CreateUserSchema.safeParse({ ...base, name: 'a'.repeat(101) }).success).toBe(false)
  })
})

// ── UpdateUserSchema ────────────────────────────────────────────────────────

describe('UpdateUserSchema', () => {
  it('accepts partial update with just name', () => {
    expect(UpdateUserSchema.safeParse({ name: 'New Name' }).success).toBe(true)
  })

  it('accepts active flag 0 or 1', () => {
    expect(UpdateUserSchema.safeParse({ active: 0 }).success).toBe(true)
    expect(UpdateUserSchema.safeParse({ active: 1 }).success).toBe(true)
  })

  it('rejects active value outside 0/1', () => {
    expect(UpdateUserSchema.safeParse({ active: 2 }).success).toBe(false)
  })

  it('accepts empty object (all fields optional)', () => {
    expect(UpdateUserSchema.safeParse({}).success).toBe(true)
  })

  it('rejects invalid role', () => {
    expect(UpdateUserSchema.safeParse({ role: 'owner' }).success).toBe(false)
  })

  it('normalises email to lowercase on update', () => {
    const result = UpdateUserSchema.safeParse({ email: 'ADMIN@WOODWINGS.AE' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.email).toBe('admin@woodwings.ae')
  })

  it('rejects invalid email on update', () => {
    expect(UpdateUserSchema.safeParse({ email: 'notanemail' }).success).toBe(false)
  })
})

// ── CreateAnnouncementSchema ────────────────────────────────────────────────

describe('CreateAnnouncementSchema', () => {
  it('accepts minimal announcement', () => {
    expect(CreateAnnouncementSchema.safeParse({ title: 'Notice' }).success).toBe(true)
  })

  it('trims title whitespace', () => {
    const result = CreateAnnouncementSchema.safeParse({ title: '  Notice  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.title).toBe('Notice')
  })

  it('rejects empty title', () => {
    expect(CreateAnnouncementSchema.safeParse({ title: '' }).success).toBe(false)
  })

  it('accepts all optional fields', () => {
    expect(CreateAnnouncementSchema.safeParse({
      title: 'Update',
      message: 'Details here',
      pinned: true,
      visibleTo: 'manager',
      expiresAt: '2026-12-31',
    }).success).toBe(true)
  })

  it('rejects invalid expiresAt format', () => {
    expect(CreateAnnouncementSchema.safeParse({ title: 'X', expiresAt: '31-12-2026' }).success).toBe(false)
  })
})

// ── CreateQuotationItemsSchema ──────────────────────────────────────────────

describe('CreateQuotationItemsSchema', () => {
  const validItem = {
    itemName: 'Wardrobe',
    description: 'Built-in oak wardrobe',
    quantity: 2,
    unitPrice: 5000,
    actions: ['Design (item)'],
  }
  const base = {
    quotationNumber: '2341',
    quotationReference: 'WW-2341-REF',
    quotationDate: '2026-06-01',
    items: [validItem],
  }

  it('accepts valid quotation with one item', () => {
    expect(CreateQuotationItemsSchema.safeParse(base).success).toBe(true)
  })

  it('rejects quotation number shorter than 4 digits', () => {
    expect(CreateQuotationItemsSchema.safeParse({ ...base, quotationNumber: '123' }).success).toBe(false)
  })

  it('rejects non-numeric quotation number', () => {
    expect(CreateQuotationItemsSchema.safeParse({ ...base, quotationNumber: 'AB12' }).success).toBe(false)
  })

  it('rejects empty items array', () => {
    expect(CreateQuotationItemsSchema.safeParse({ ...base, items: [] }).success).toBe(false)
  })

  it('rejects item with no actions', () => {
    const badItem = { ...validItem, actions: [] }
    expect(CreateQuotationItemsSchema.safeParse({ ...base, items: [badItem] }).success).toBe(false)
  })

  it('rejects invalid action value', () => {
    const badItem = { ...validItem, actions: ['Paint Wall'] }
    expect(CreateQuotationItemsSchema.safeParse({ ...base, items: [badItem] }).success).toBe(false)
  })

  it('rejects empty quotationReference', () => {
    expect(CreateQuotationItemsSchema.safeParse({ ...base, quotationReference: '' }).success).toBe(false)
  })
})

// ── CreateMaterialsSchema ───────────────────────────────────────────────────

describe('CreateMaterialsSchema', () => {
  const validItem = { name: 'Oak Veneer' }
  const base = { items: [validItem] }

  it('accepts minimal item with just a name', () => {
    expect(CreateMaterialsSchema.safeParse(base).success).toBe(true)
  })

  it('accepts full item', () => {
    expect(CreateMaterialsSchema.safeParse({
      items: [{ name: 'MDF Board', supplier: 'Dubai Wood', quantity: 10, unit: 'm²', unitCost: 120, notes: 'Grade A' }],
    }).success).toBe(true)
  })

  it('rejects empty items array', () => {
    expect(CreateMaterialsSchema.safeParse({ items: [] }).success).toBe(false)
  })

  it('rejects invalid unit', () => {
    expect(CreateMaterialsSchema.safeParse({ items: [{ name: 'X', unit: 'ton' }] }).success).toBe(false)
  })
})

// ── CreateMaterialOrderSchema ───────────────────────────────────────────────

describe('CreateMaterialOrderSchema', () => {
  const validItem = { name: 'Screws', quantity: 100, unit: 'pcs' }

  it('accepts Project purpose with projectId', () => {
    expect(CreateMaterialOrderSchema.safeParse({
      purpose: 'Project',
      projectId: 'recABC',
      items: [validItem],
    }).success).toBe(true)
  })

  it('accepts Office purpose without projectId', () => {
    expect(CreateMaterialOrderSchema.safeParse({
      purpose: 'Office',
      items: [validItem],
    }).success).toBe(true)
  })

  it('rejects Project purpose without projectId', () => {
    const result = CreateMaterialOrderSchema.safeParse({ purpose: 'Project', items: [validItem] })
    expect(result.success).toBe(false)
  })

  it('rejects empty items array', () => {
    expect(CreateMaterialOrderSchema.safeParse({ purpose: 'Office', items: [] }).success).toBe(false)
  })

  it('rejects invalid purpose', () => {
    expect(CreateMaterialOrderSchema.safeParse({ purpose: 'Home', items: [validItem] }).success).toBe(false)
  })

  it('rejects item with zero quantity', () => {
    expect(CreateMaterialOrderSchema.safeParse({
      purpose: 'Factory',
      items: [{ name: 'X', quantity: 0, unit: 'pcs' }],
    }).success).toBe(false)
  })
})

// ── CreateHandoverSchema ────────────────────────────────────────────────────

describe('CreateHandoverSchema', () => {
  const base = {
    finalInstallationDate: '2026-06-15',
    customerSatisfaction: 'Satisfied',
    installationDifficulty: 'Medium',
  }

  it('accepts valid handover', () => {
    expect(CreateHandoverSchema.safeParse(base).success).toBe(true)
  })

  it('accepts all optional fields', () => {
    expect(CreateHandoverSchema.safeParse({ ...base, newsletterOptIn: true, notes: 'All good' }).success).toBe(true)
  })

  it('rejects invalid customerSatisfaction', () => {
    expect(CreateHandoverSchema.safeParse({ ...base, customerSatisfaction: 'Happy' }).success).toBe(false)
  })

  it('rejects invalid installationDifficulty', () => {
    expect(CreateHandoverSchema.safeParse({ ...base, installationDifficulty: 'Extreme' }).success).toBe(false)
  })

  it('rejects malformed finalInstallationDate', () => {
    expect(CreateHandoverSchema.safeParse({ ...base, finalInstallationDate: '15/06/2026' }).success).toBe(false)
  })

  it('accepts all valid satisfaction values', () => {
    ['Very Satisfied', 'Satisfied', 'Neutral', 'Unsatisfied'].forEach((v) => {
      expect(CreateHandoverSchema.safeParse({ ...base, customerSatisfaction: v }).success).toBe(true)
    })
  })
})

// ── CreateInstallationLogSchema ─────────────────────────────────────────────

describe('CreateInstallationLogSchema', () => {
  const base = {
    project: ['recABC'],
    date: '2026-06-15',
  }

  it('accepts minimal log entry', () => {
    expect(CreateInstallationLogSchema.safeParse(base).success).toBe(true)
  })

  it('accepts full log entry', () => {
    expect(CreateInstallationLogSchema.safeParse({
      ...base,
      installationTeam: 'Mr. Yahia',
      numberOfLaborers: 4,
      workDescription: 'Installed kitchen cabinets',
      expectedFinishDate: '2026-06-20',
    }).success).toBe(true)
  })

  it('rejects missing project', () => {
    expect(CreateInstallationLogSchema.safeParse({ date: '2026-06-15' }).success).toBe(false)
  })

  it('rejects malformed date', () => {
    expect(CreateInstallationLogSchema.safeParse({ ...base, date: '15-06-2026' }).success).toBe(false)
  })

  it('rejects invalid installationTeam', () => {
    expect(CreateInstallationLogSchema.safeParse({ ...base, installationTeam: 'Mr. Unknown' }).success).toBe(false)
  })

  it('rejects numberOfLaborers = 0', () => {
    expect(CreateInstallationLogSchema.safeParse({ ...base, numberOfLaborers: 0 }).success).toBe(false)
  })
})

// ── CreatePurchaseOrderSchema ───────────────────────────────────────────────

describe('CreatePurchaseOrderSchema', () => {
  const base = {
    project: ['recABC'],
    supplier: 'Al Futtaim Timber',
  }

  it('accepts minimal purchase order', () => {
    expect(CreatePurchaseOrderSchema.safeParse(base).success).toBe(true)
  })

  it('accepts full purchase order', () => {
    expect(CreatePurchaseOrderSchema.safeParse({
      ...base,
      totalAmount: 15000,
      orderDate: '2026-06-01',
      expectedDelivery: '2026-06-10',
      notes: 'Urgent',
    }).success).toBe(true)
  })

  it('trims supplier whitespace', () => {
    const result = CreatePurchaseOrderSchema.safeParse({ ...base, supplier: '  Supplier  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.supplier).toBe('Supplier')
  })

  it('rejects missing project', () => {
    expect(CreatePurchaseOrderSchema.safeParse({ supplier: 'X' }).success).toBe(false)
  })

  it('rejects empty supplier', () => {
    expect(CreatePurchaseOrderSchema.safeParse({ ...base, supplier: '' }).success).toBe(false)
  })

  it('rejects malformed orderDate', () => {
    expect(CreatePurchaseOrderSchema.safeParse({ ...base, orderDate: '01/06/2026' }).success).toBe(false)
  })
})

// ── CreateCalendarEventSchema ───────────────────────────────────────────────

describe('CreateCalendarEventSchema', () => {
  const base = {
    title: 'Site Visit',
    date: '2026-06-20',
  }

  it('accepts minimal event', () => {
    expect(CreateCalendarEventSchema.safeParse(base).success).toBe(true)
  })

  it('accepts full event', () => {
    expect(CreateCalendarEventSchema.safeParse({
      ...base,
      notes: 'Bring drawings',
      projectId: 'recABC',
      eventType: 'installation',
      teamMemberIds: ['rec1', 'rec2'],
    }).success).toBe(true)
  })

  it('trims title whitespace', () => {
    const result = CreateCalendarEventSchema.safeParse({ ...base, title: '  Visit  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.title).toBe('Visit')
  })

  it('rejects empty title', () => {
    expect(CreateCalendarEventSchema.safeParse({ ...base, title: '' }).success).toBe(false)
  })

  it('rejects malformed date', () => {
    expect(CreateCalendarEventSchema.safeParse({ ...base, date: '20/06/2026' }).success).toBe(false)
  })

  it('rejects invalid eventType', () => {
    expect(CreateCalendarEventSchema.safeParse({ ...base, eventType: 'meeting' }).success).toBe(false)
  })

  it('accepts all valid eventTypes', () => {
    ['activity', 'installation', 'fabrication', 'delivery'].forEach((t) => {
      expect(CreateCalendarEventSchema.safeParse({ ...base, eventType: t }).success).toBe(true)
    })
  })
})
