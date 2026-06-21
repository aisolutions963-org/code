const TZ = 'Asia/Dubai'

/** Current date in UAE time as YYYY-MM-DD */
export function todayUAE(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ })
}

// WoodWings fiscal quarters: Q1=Dec–Feb, Q2=Mar–May, Q3=Jun–Aug, Q4=Sep–Nov
// December belongs to the NEXT calendar year's Q1 (e.g. Dec 2025 → FY2026 Q1)
const MONTH_TO_QUARTER: Record<number, 1 | 2 | 3 | 4> = {
  11: 1, 0: 1, 1: 1,   // Dec, Jan, Feb → Q1
  2: 2, 3: 2, 4: 2,    // Mar, Apr, May → Q2
  5: 3, 6: 3, 7: 3,    // Jun, Jul, Aug → Q3
  8: 4, 9: 4, 10: 4,   // Sep, Oct, Nov → Q4
}

interface QuarterInfo {
  quarter: 1 | 2 | 3 | 4
  fiscalYear: number   // the year the quarter belongs to (Dec → next year)
  label: string        // e.g. "Q1 Dec–Feb 2026"
  start: Date
  end: Date
}

/** Returns WoodWings fiscal quarter info for a given date (defaults to today UAE). */
export function getWoodWingsQuarter(date?: Date): QuarterInfo {
  const d = date ?? new Date()
  const month = d.getMonth()  // 0-indexed
  const year  = d.getFullYear()
  const q = MONTH_TO_QUARTER[month]
  // December is Q1 of the NEXT fiscal year
  const fiscalYear = month === 11 ? year + 1 : year
  return buildQuarterInfo(q, fiscalYear)
}

/** Returns QuarterInfo for an explicit quarter number + fiscal year. */
export function getWoodWingsQuarterRange(quarter: 1 | 2 | 3 | 4, fiscalYear: number): QuarterInfo {
  return buildQuarterInfo(quarter, fiscalYear)
}

/** Returns a human-readable label like "Q1 Dec–Feb 2026". */
export function getWoodWingsQuarterLabel(quarter: 1 | 2 | 3 | 4, fiscalYear: number): string {
  return buildQuarterInfo(quarter, fiscalYear).label
}

function buildQuarterInfo(q: 1 | 2 | 3 | 4, fiscalYear: number): QuarterInfo {
  let start: Date, end: Date, label: string
  switch (q) {
    case 1:
      // Dec of previous calendar year → Feb of fiscalYear
      start = new Date(fiscalYear - 1, 11, 1)
      end   = new Date(fiscalYear, 2, 0)   // last day of Feb
      label = `Q1 Dec–Feb ${fiscalYear}`
      break
    case 2:
      start = new Date(fiscalYear, 2, 1)   // Mar
      end   = new Date(fiscalYear, 5, 0)   // last day of May
      label = `Q2 Mar–May ${fiscalYear}`
      break
    case 3:
      start = new Date(fiscalYear, 5, 1)   // Jun
      end   = new Date(fiscalYear, 8, 0)   // last day of Aug
      label = `Q3 Jun–Aug ${fiscalYear}`
      break
    case 4:
      start = new Date(fiscalYear, 8, 1)   // Sep
      end   = new Date(fiscalYear, 11, 0)  // last day of Nov
      label = `Q4 Sep–Nov ${fiscalYear}`
      break
  }
  return { quarter: q, fiscalYear, label, start, end }
}

/** Returns all four QuarterInfo objects for a given fiscal year. */
export function getWoodWingsYearQuarters(fiscalYear: number): QuarterInfo[] {
  return [1, 2, 3, 4].map((q) => buildQuarterInfo(q as 1 | 2 | 3 | 4, fiscalYear))
}

/** Current date+time formatted for display in UAE time */
export function nowUAEString(): string {
  return new Date().toLocaleString('en-GB', {
    timeZone: TZ,
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** Format an ISO date string or Date for display in UAE time */
export function fmtUAE(
  value: string | Date,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
): string {
  const d = typeof value === 'string' ? new Date(value) : value
  return d.toLocaleDateString('en-AE', { timeZone: TZ, ...opts })
}
