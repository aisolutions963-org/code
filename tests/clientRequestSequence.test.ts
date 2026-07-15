import { describe, it, expect } from 'vitest'
import { CR_TASK_SEQUENCE } from '@/lib/airtable/client-requests'

// The Trade/Maintenance unlock chain (lib/workflow.ts) drives entirely off task NAMES via
// CR_TASK_SEQUENCE, since these tasks have no writable templateOrder. This guards the
// invariant that every task the workflow expects to sequence is present with the right
// 1-based position — a rename that breaks the chain would fail here loudly instead of
// silently stalling the chain in production.
describe('CR_TASK_SEQUENCE', () => {
  it('maps each Trade task to its 1-based chain position', () => {
    expect(CR_TASK_SEQUENCE['F3 — Order Trade Material']).toBe(1)
    expect(CR_TASK_SEQUENCE['F4 — Trade Payment']).toBe(2)
    expect(CR_TASK_SEQUENCE['Handover to Client']).toBe(3)
  })

  it('maps each Maintenance task to its 1-based chain position', () => {
    expect(CR_TASK_SEQUENCE['Site Visit & Assessment']).toBe(1)
    expect(CR_TASK_SEQUENCE['Carry Out Maintenance Work']).toBe(2)
    expect(CR_TASK_SEQUENCE['Client Sign-off']).toBe(3)
  })

  it('covers exactly the six client-request task names', () => {
    expect(Object.keys(CR_TASK_SEQUENCE).sort()).toEqual(
      [
        'Carry Out Maintenance Work',
        'Client Sign-off',
        'F3 — Order Trade Material',
        'F4 — Trade Payment',
        'Handover to Client',
        'Site Visit & Assessment',
      ].sort(),
    )
  })
})
