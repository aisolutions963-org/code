const TZ = 'Asia/Dubai'

/** Current date in UAE time as YYYY-MM-DD */
export function todayUAE(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ })
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
