import { describe, it, expect } from 'vitest'
import {
  getWoodWingsQuarter,
  getWoodWingsQuarterRange,
  getWoodWingsQuarterLabel,
  getWoodWingsYearQuarters,
} from '@/lib/dateUtils'

// ── getWoodWingsQuarter ─────────────────────────────────────────────────────

describe('getWoodWingsQuarter', () => {
  it('January → Q1 of same year', () => {
    const r = getWoodWingsQuarter(new Date('2026-01-15'))
    expect(r.quarter).toBe(1)
    expect(r.fiscalYear).toBe(2026)
  })

  it('February → Q1 of same year', () => {
    const r = getWoodWingsQuarter(new Date('2026-02-28'))
    expect(r.quarter).toBe(1)
    expect(r.fiscalYear).toBe(2026)
  })

  it('March → Q2 of same year', () => {
    const r = getWoodWingsQuarter(new Date('2026-03-01'))
    expect(r.quarter).toBe(2)
    expect(r.fiscalYear).toBe(2026)
  })

  it('May → Q2 of same year', () => {
    const r = getWoodWingsQuarter(new Date('2026-05-31'))
    expect(r.quarter).toBe(2)
    expect(r.fiscalYear).toBe(2026)
  })

  it('June → Q3 of same year', () => {
    const r = getWoodWingsQuarter(new Date('2026-06-16'))
    expect(r.quarter).toBe(3)
    expect(r.fiscalYear).toBe(2026)
  })

  it('August → Q3 of same year', () => {
    const r = getWoodWingsQuarter(new Date('2026-08-31'))
    expect(r.quarter).toBe(3)
    expect(r.fiscalYear).toBe(2026)
  })

  it('September → Q4 of same year', () => {
    const r = getWoodWingsQuarter(new Date('2026-09-01'))
    expect(r.quarter).toBe(4)
    expect(r.fiscalYear).toBe(2026)
  })

  it('November → Q4 of same year', () => {
    const r = getWoodWingsQuarter(new Date('2026-11-30'))
    expect(r.quarter).toBe(4)
    expect(r.fiscalYear).toBe(2026)
  })

  it('December → Q1 of the NEXT fiscal year', () => {
    const r = getWoodWingsQuarter(new Date('2025-12-01'))
    expect(r.quarter).toBe(1)
    expect(r.fiscalYear).toBe(2026)
  })

  it('December 31st → Q1 of the NEXT fiscal year', () => {
    const r = getWoodWingsQuarter(new Date('2025-12-31'))
    expect(r.quarter).toBe(1)
    expect(r.fiscalYear).toBe(2026)
  })
})

// ── getWoodWingsQuarterRange ─────────────────────────────────────────────────

describe('getWoodWingsQuarterRange', () => {
  it('Q1 FY2026 starts in Dec 2025', () => {
    const r = getWoodWingsQuarterRange(1, 2026)
    expect(r.start.getFullYear()).toBe(2025)
    expect(r.start.getMonth()).toBe(11) // December
    expect(r.start.getDate()).toBe(1)
  })

  it('Q1 FY2026 ends last day of Feb 2026', () => {
    const r = getWoodWingsQuarterRange(1, 2026)
    expect(r.end.getFullYear()).toBe(2026)
    expect(r.end.getMonth()).toBe(1) // February
  })

  it('Q2 FY2026 starts March 2026', () => {
    const r = getWoodWingsQuarterRange(2, 2026)
    expect(r.start.getMonth()).toBe(2) // March
    expect(r.start.getFullYear()).toBe(2026)
  })

  it('Q4 FY2026 ends in November 2026', () => {
    const r = getWoodWingsQuarterRange(4, 2026)
    expect(r.end.getMonth()).toBe(10) // November
    expect(r.end.getFullYear()).toBe(2026)
  })

  it('start is always before end', () => {
    ;([1, 2, 3, 4] as const).forEach((q) => {
      const r = getWoodWingsQuarterRange(q, 2026)
      expect(r.start < r.end).toBe(true)
    })
  })

  it('returns correct quarter number', () => {
    ;([1, 2, 3, 4] as const).forEach((q) => {
      expect(getWoodWingsQuarterRange(q, 2026).quarter).toBe(q)
    })
  })

  it('returns correct fiscalYear', () => {
    expect(getWoodWingsQuarterRange(3, 2027).fiscalYear).toBe(2027)
  })
})

// ── getWoodWingsQuarterLabel ─────────────────────────────────────────────────

describe('getWoodWingsQuarterLabel', () => {
  it('Q1 FY2026 label contains year', () => {
    const label = getWoodWingsQuarterLabel(1, 2026)
    expect(label).toContain('Q1')
    expect(label).toContain('2026')
  })

  it('Q2 label mentions Mar–May', () => {
    const label = getWoodWingsQuarterLabel(2, 2026)
    expect(label).toContain('Q2')
    expect(label).toMatch(/Mar/i)
  })

  it('Q3 label mentions Jun–Aug', () => {
    const label = getWoodWingsQuarterLabel(3, 2026)
    expect(label).toContain('Q3')
    expect(label).toMatch(/Jun/i)
  })

  it('Q4 label mentions Sep–Nov', () => {
    const label = getWoodWingsQuarterLabel(4, 2026)
    expect(label).toContain('Q4')
    expect(label).toMatch(/Sep/i)
  })

  it('returns a non-empty string for all quarters', () => {
    ;([1, 2, 3, 4] as const).forEach((q) => {
      expect(typeof getWoodWingsQuarterLabel(q, 2026)).toBe('string')
      expect(getWoodWingsQuarterLabel(q, 2026).length).toBeGreaterThan(0)
    })
  })
})

// ── getWoodWingsYearQuarters ─────────────────────────────────────────────────

describe('getWoodWingsYearQuarters', () => {
  it('returns exactly 4 quarters', () => {
    expect(getWoodWingsYearQuarters(2026)).toHaveLength(4)
  })

  it('quarters are numbered 1 through 4', () => {
    const quarters = getWoodWingsYearQuarters(2026)
    expect(quarters.map((q) => q.quarter)).toEqual([1, 2, 3, 4])
  })

  it('all quarters belong to the requested fiscal year', () => {
    const quarters = getWoodWingsYearQuarters(2026)
    quarters.forEach((q) => expect(q.fiscalYear).toBe(2026))
  })

  it('Q1 start (Dec) is in the previous calendar year', () => {
    const [q1] = getWoodWingsYearQuarters(2026)
    expect(q1.start.getFullYear()).toBe(2025)
    expect(q1.start.getMonth()).toBe(11)
  })
})
