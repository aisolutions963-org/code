import { FAILED_REQUESTS } from './fieldMap'

const getBaseUrl = () =>
  `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${FAILED_REQUESTS.TABLE_ID}`

const getHeaders = () => ({
  Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json',
})

const SENSITIVE_KEYS = new Set([
  'password',
  'hashed_password',
  'token',
  'secret',
  'authorization',
])

function sanitize(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload
  if (Array.isArray(payload)) return payload.map(sanitize)
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    result[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : sanitize(v)
  }
  return result
}

export interface FailedRequestEntry {
  requestId: string
  endpoint: string
  method: string
  event: string
  errorMessage: string
  statusCode: number
  inputPayload?: unknown
}

export function storeFailedRequest(entry: FailedRequestEntry): void {
  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) return

  const sanitized = entry.inputPayload ? sanitize(entry.inputPayload) : undefined
  const fields: Record<string, unknown> = {
    [FAILED_REQUESTS.REQUEST_ID]: entry.requestId,
    [FAILED_REQUESTS.ENDPOINT]: entry.endpoint,
    [FAILED_REQUESTS.METHOD]: entry.method,
    [FAILED_REQUESTS.EVENT]: entry.event,
    [FAILED_REQUESTS.ERROR_MESSAGE]: entry.errorMessage.slice(0, 5000),
    [FAILED_REQUESTS.STATUS_CODE]: entry.statusCode,
    [FAILED_REQUESTS.TIMESTAMP]: new Date().toISOString(),
  }
  if (sanitized) fields[FAILED_REQUESTS.INPUT_PAYLOAD] = JSON.stringify(sanitized)

  fetch(getBaseUrl(), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ records: [{ fields }] }),
  }).catch((err) => console.error('[FailedRequests] Write failed:', err))
}

export interface FailedRequestRecord {
  id: string
  requestId: string
  endpoint: string
  method: string
  event: string
  errorMessage: string
  statusCode: number
  inputPayload?: unknown
  replayed: boolean
  replayResult?: string
  timestamp: string
}

export async function getFailedRequests(limit = 20): Promise<FailedRequestRecord[]> {
  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) return []

  const params = new URLSearchParams()
  params.set('sort[0][field]', FAILED_REQUESTS.TIMESTAMP)
  params.set('sort[0][direction]', 'desc')
  params.set('maxRecords', String(limit))

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
      requestId: String(r.fields[FAILED_REQUESTS.REQUEST_ID] ?? ''),
      endpoint: String(r.fields[FAILED_REQUESTS.ENDPOINT] ?? ''),
      method: String(r.fields[FAILED_REQUESTS.METHOD] ?? ''),
      event: String(r.fields[FAILED_REQUESTS.EVENT] ?? ''),
      errorMessage: String(r.fields[FAILED_REQUESTS.ERROR_MESSAGE] ?? ''),
      statusCode:
        typeof r.fields[FAILED_REQUESTS.STATUS_CODE] === 'number'
          ? (r.fields[FAILED_REQUESTS.STATUS_CODE] as number)
          : 0,
      inputPayload: r.fields[FAILED_REQUESTS.INPUT_PAYLOAD]
        ? (() => { try { return JSON.parse(String(r.fields[FAILED_REQUESTS.INPUT_PAYLOAD])) } catch { return undefined } })()
        : undefined,
      replayed: Boolean(r.fields[FAILED_REQUESTS.REPLAYED]),
      replayResult: r.fields[FAILED_REQUESTS.REPLAY_RESULT]
        ? String(r.fields[FAILED_REQUESTS.REPLAY_RESULT])
        : undefined,
      timestamp: String(r.fields[FAILED_REQUESTS.TIMESTAMP] ?? ''),
    }))
  } catch {
    return []
  }
}

export async function markReplayed(recordId: string, result: string): Promise<void> {
  if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) return
  await fetch(`${getBaseUrl()}/${recordId}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({
      fields: {
        [FAILED_REQUESTS.REPLAYED]: true,
        [FAILED_REQUESTS.REPLAY_RESULT]: result.slice(0, 5000),
      },
    }),
  })
}
