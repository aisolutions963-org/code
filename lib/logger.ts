import { SYSTEM_LOGS } from './fieldMap'

const getBaseUrl = () =>
  `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${SYSTEM_LOGS.TABLE_ID}`

const getHeaders = () => ({
  Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json',
})

export interface LogEntry {
  requestId: string
  level: 'info' | 'warn' | 'error'
  event: string
  userId?: string
  durationMs?: number
  metadata?: Record<string, unknown>
}

type AirtableRecord = { fields: Record<string, unknown> }

// Buffered batch writer — flushes every 5s or on 10 entries
const _buffer: AirtableRecord[] = []
let _flushTimer: ReturnType<typeof setTimeout> | null = null

function scheduleFlush(): void {
  if (_flushTimer) return
  _flushTimer = setTimeout(flushBuffer, 5000)
}

function flushBuffer(): void {
  _flushTimer = null
  if (_buffer.length === 0) return
  const batch = _buffer.splice(0, 10)
  fetch(getBaseUrl(), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ records: batch }),
  }).catch((err) => console.error('[Logger] Batch write failed:', err))
  if (_buffer.length > 0) scheduleFlush()
}

export function log(entry: LogEntry): void {
  const timestamp = new Date().toISOString()

  const printer =
    entry.level === 'error'
      ? console.error
      : entry.level === 'warn'
        ? console.warn
        : console.log
  printer(`[${entry.level.toUpperCase()}] [${entry.requestId}] ${entry.event}`, entry.metadata ?? '')

  // Only persist warn/error to Airtable — successful requests never go to Airtable
  if (entry.level === 'info') return
  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) return

  const fields: Record<string, unknown> = {
    [SYSTEM_LOGS.EVENT]: entry.event,
    [SYSTEM_LOGS.LEVEL]: entry.level,
    [SYSTEM_LOGS.REQUEST_ID]: entry.requestId,
    [SYSTEM_LOGS.TIMESTAMP]: timestamp,
  }
  if (entry.userId) fields[SYSTEM_LOGS.USER_ID] = entry.userId
  if (entry.durationMs !== undefined) fields[SYSTEM_LOGS.DURATION_MS] = entry.durationMs
  if (entry.metadata) fields[SYSTEM_LOGS.METADATA] = JSON.stringify(entry.metadata)

  _buffer.push({ fields })
  if (_buffer.length >= 10) {
    flushBuffer()
  } else {
    scheduleFlush()
  }
}

export interface LogRecord {
  id: string
  event: string
  level: string
  requestId: string
  userId?: string
  durationMs?: number
  metadata?: unknown
  timestamp: string
}

export interface FetchLogsOptions {
  level?: 'info' | 'warn' | 'error'
  requestId?: string
  limit?: number
}

export async function getLogs(options: FetchLogsOptions = {}): Promise<LogRecord[]> {
  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) return []

  const params = new URLSearchParams()
  params.set('sort[0][field]', SYSTEM_LOGS.TIMESTAMP)
  params.set('sort[0][direction]', 'desc')
  params.set('maxRecords', String(options.limit ?? 50))

  const filters: string[] = []
  if (options.level) filters.push(`{${SYSTEM_LOGS.LEVEL}}="${options.level}"`)
  if (options.requestId) filters.push(`{${SYSTEM_LOGS.REQUEST_ID}}="${options.requestId}"`)
  if (filters.length === 1) params.set('filterByFormula', filters[0])
  if (filters.length > 1) params.set('filterByFormula', `AND(${filters.join(',')})`)

  try {
    const res = await fetch(`${getBaseUrl()}?${params}`, {
      headers: getHeaders(),
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = await res.json() as {
      records: { id: string; fields: Record<string, unknown> }[]
    }
    return data.records.map((r) => ({
      id: r.id,
      event: String(r.fields[SYSTEM_LOGS.EVENT] ?? ''),
      level: String(r.fields[SYSTEM_LOGS.LEVEL] ?? 'info'),
      requestId: String(r.fields[SYSTEM_LOGS.REQUEST_ID] ?? ''),
      userId: r.fields[SYSTEM_LOGS.USER_ID] ? String(r.fields[SYSTEM_LOGS.USER_ID]) : undefined,
      durationMs:
        typeof r.fields[SYSTEM_LOGS.DURATION_MS] === 'number'
          ? (r.fields[SYSTEM_LOGS.DURATION_MS] as number)
          : undefined,
      metadata: r.fields[SYSTEM_LOGS.METADATA]
        ? (() => { try { return JSON.parse(String(r.fields[SYSTEM_LOGS.METADATA])) } catch { return undefined } })()
        : undefined,
      timestamp: String(r.fields[SYSTEM_LOGS.TIMESTAMP] ?? ''),
    }))
  } catch {
    return []
  }
}
