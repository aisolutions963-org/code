import { describe, it, expect } from 'vitest'
import { isAutoTask } from '@/lib/phases'

describe('isAutoTask', () => {
  it('recognizes (auto)-marked tasks', () => {
    expect(isAutoTask('Change Project Status to Closed Project List (auto)')).toBe(true)
    expect(isAutoTask('Notify Accountant (auto)')).toBe(true)
  })

  it('recognizes headline banners', () => {
    expect(isAutoTask('To follow tasks progress, watch this space')).toBe(true)
  })

  it('treats the final closing task as auto even without an (auto) marker', () => {
    // Regression: order-64 "Change Status to Closed and Valid Maintenance …" is a System
    // stage-transition step; it must self-complete so the project reaches active warranty.
    expect(isAutoTask('Change Status to Closed and Valid Maintenance (1-Year Timer from Closure Date)')).toBe(true)
  })

  it('leaves ordinary user tasks non-auto', () => {
    expect(isAutoTask('F4 Form — Final Payment')).toBe(false)
    expect(isAutoTask('Fabrication Done')).toBe(false)
    expect(isAutoTask('Handing Over Form')).toBe(false)
  })
})
