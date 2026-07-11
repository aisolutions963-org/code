import { describe, it, expect } from 'vitest'
import { canEditField, filterAllowedFields, EDITABLE_FIELDS } from '@/lib/permissions'
import type { TaskUpdateInput } from '@/lib/types'

// ── canEditField ────────────────────────────────────────────────────────────

describe('canEditField', () => {
  it('superadmin can edit any field', () => {
    expect(canEditField('superadmin', 'status')).toBe(true)
    expect(canEditField('superadmin', 'superadminNote')).toBe(true)
    expect(canEditField('superadmin', 'followUpOutcome')).toBe(true)
    expect(canEditField('superadmin', 'priorityFlag')).toBe(true)
  })

  it('manager can edit status', () => {
    expect(canEditField('manager', 'status')).toBe(true)
  })

  it('manager can edit managerComment', () => {
    expect(canEditField('manager', 'managerComment')).toBe(true)
  })

  it('manager cannot edit sedNote', () => {
    expect(canEditField('manager', 'sedNote')).toBe(false)
  })

  it('manager cannot edit superadminNote', () => {
    expect(canEditField('manager', 'superadminNote')).toBe(false)
  })

  it('sed can edit postVisitOutcome', () => {
    expect(canEditField('sed', 'postVisitOutcome')).toBe(true)
  })

  it('sed cannot edit managerComment', () => {
    expect(canEditField('sed', 'managerComment')).toBe(false)
  })

  it('sed cannot edit superadminNote', () => {
    expect(canEditField('sed', 'superadminNote')).toBe(false)
  })

  it('fabrication can edit fabricationPath', () => {
    expect(canEditField('fabrication', 'fabricationPath')).toBe(true)
  })

  it('fabrication cannot edit sedNote', () => {
    expect(canEditField('fabrication', 'sedNote')).toBe(false)
  })

  it('installation can edit teamDaysRequired', () => {
    expect(canEditField('installation', 'teamDaysRequired')).toBe(true)
  })

  it('installation cannot edit fabricationPath', () => {
    expect(canEditField('installation', 'fabricationPath')).toBe(false)
  })

  it('returns false for unknown field on non-superadmin', () => {
    expect(canEditField('sed', 'nonExistentField')).toBe(false)
    expect(canEditField('manager', 'nonExistentField')).toBe(false)
  })
})

// ── filterAllowedFields ─────────────────────────────────────────────────────

describe('filterAllowedFields', () => {
  it('superadmin gets all fields back unchanged', () => {
    const input: Partial<TaskUpdateInput> = {
      status: 'In Progress',
      superadminNote: 'VIP client',
      followUpOutcome: 'SED to Follow Up',
    }
    expect(filterAllowedFields('superadmin', input)).toEqual(input)
  })

  it('sed only keeps allowed fields', () => {
    const input: Partial<TaskUpdateInput> = {
      status: 'In Progress',
      postVisitOutcome: 'Client agreed',
      superadminNote: 'should be stripped',
      managerComment: 'should be stripped',
    }
    const result = filterAllowedFields('sed', input)
    expect(result).toHaveProperty('status', 'In Progress')
    expect(result).toHaveProperty('postVisitOutcome', 'Client agreed')
    expect(result).not.toHaveProperty('superadminNote')
    expect(result).not.toHaveProperty('managerComment')
  })

  it('manager strips fabrication-only fields', () => {
    const input: Partial<TaskUpdateInput> = {
      status: 'In Progress',
      fabricationPath: 'should be stripped',
      managerComment: 'looks good',
    }
    const result = filterAllowedFields('manager', input)
    expect(result).toHaveProperty('status')
    expect(result).toHaveProperty('managerComment')
    expect(result).not.toHaveProperty('fabricationPath')
  })

  it('fabrication strips installation-only fields', () => {
    const input: Partial<TaskUpdateInput> = {
      fabricationPath: 'Oak veneer',
      installationDays: 3,  // installation only
      sedNote: 'sed only',
    }
    const result = filterAllowedFields('fabrication', input)
    expect(result).toHaveProperty('fabricationPath')
    expect(result).not.toHaveProperty('installationDays')
    expect(result).not.toHaveProperty('sedNote')
  })

  it('returns empty object when all fields are disallowed', () => {
    const input: Partial<TaskUpdateInput> = {
      superadminNote: 'admin only',
      followUpOutcome: 'Reject Project',
    }
    const result = filterAllowedFields('sed', input)
    expect(Object.keys(result)).toHaveLength(0)
  })

  it('installation keeps its allowed fields', () => {
    const input: Partial<TaskUpdateInput> = {
      teamDaysRequired: 5,
      noOfLaborsPerDay: 4,
      qcCheckAtSiteDone: true,
      sedNote: 'should be stripped',
    }
    const result = filterAllowedFields('installation', input)
    expect(result).toHaveProperty('teamDaysRequired', 5)
    expect(result).toHaveProperty('noOfLaborsPerDay', 4)
    expect(result).toHaveProperty('qcCheckAtSiteDone', true)
    expect(result).not.toHaveProperty('sedNote')
  })
})

// ── EDITABLE_FIELDS config consistency ─────────────────────────────────────

describe('EDITABLE_FIELDS config', () => {
  it('all roles define a status field', () => {
    const roles = ['sed', 'manager', 'fabrication', 'installation', 'superadmin'] as const
    roles.forEach((role) => {
      expect((EDITABLE_FIELDS[role] as string[]).includes('status')).toBe(true)
    })
  })

  it('superadmin has more fields than any other role', () => {
    const superadminCount = EDITABLE_FIELDS.superadmin.length
    expect(superadminCount).toBeGreaterThan(EDITABLE_FIELDS.manager.length)
    expect(superadminCount).toBeGreaterThan(EDITABLE_FIELDS.sed.length)
    expect(superadminCount).toBeGreaterThan(EDITABLE_FIELDS.fabrication.length)
    expect(superadminCount).toBeGreaterThan(EDITABLE_FIELDS.installation.length)
  })
})
