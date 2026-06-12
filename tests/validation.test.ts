import { describe, it, expect } from 'vitest'
import {
  CreatePaymentSchema,
  UpdatePaymentSchema,
  CreateProjectSchema,
  CreateClientRequestSchema,
  LoginSchema,
  CreateUserSchema,
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

  it('accepts valid Maintenance request (no parentProjectId required)', () => {
    const input = {
      requestType: 'Maintenance',
      clientName: 'Ahmed Khalil',
    }
    expect(CreateClientRequestSchema.safeParse(input).success).toBe(true)
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
