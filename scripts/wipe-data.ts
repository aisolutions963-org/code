// Wipes ALL transactional records from the Airtable base named by AIRTABLE_BASE_ID,
// resetting the app to zero. KEEPS reference/config tables: Task Templates, Team
// Members, Workers.
//
// Run (dry run — just counts):   npx tsx scripts/wipe-data.ts
// Run (actually delete):         npx tsx scripts/wipe-data.ts --confirm
//
// Loads .env.local, so it targets whatever base that file points at. Double-check the
// printed base id before confirming — this is destructive and irreversible.
import { config as loadEnv } from 'dotenv'
import {
  PROJECTS, TASKS, PROJECT_ITEMS, QUOTATIONS, QUOTATION_LINE_ITEMS, PAYMENTS,
  MATERIALS_NEEDED, MAINTENANCE, PURCHASE_ORDERS, INSTALLATION_LOGS, HANDOVER_SHEETS,
  CALENDAR_EVENTS, FOLLOW_UP_LOG, PRODUCTION_TIMESHEETS, PAYABLES, RECEIVABLES,
  CLIENTS, END_USERS, ANNOUNCEMENTS, SYSTEM_LOGS, FAILED_REQUESTS,
} from '../lib/fieldMap'

// Prefer .env.local (Next convention) over the default .env that dotenv/config loads.
loadEnv({ path: '.env.local', override: true })

const BASE_ID = process.env.AIRTABLE_BASE_ID
const API_KEY = process.env.AIRTABLE_API_KEY
if (!BASE_ID || !API_KEY) {
  console.error('Missing AIRTABLE_BASE_ID / AIRTABLE_API_KEY (set them in .env.local).')
  process.exit(1)
}

// Transactional tables to wipe — name → tableId. KEEPS: TASK_TEMPLATES, TEAM_MEMBERS, WORKERS.
const TABLES: { name: string; id: string }[] = [
  { name: 'Projects',              id: PROJECTS.TABLE_ID },
  { name: 'Tasks',                 id: TASKS.TABLE_ID },
  { name: 'Project Items',         id: PROJECT_ITEMS.TABLE_ID },
  { name: 'Quotations',            id: QUOTATIONS.TABLE_ID },
  { name: 'Quotation Line Items',  id: QUOTATION_LINE_ITEMS.TABLE_ID },
  { name: 'Payments',              id: PAYMENTS.TABLE_ID },
  { name: 'Materials Needed',      id: MATERIALS_NEEDED.TABLE_ID },
  { name: 'Maintenance',           id: MAINTENANCE.TABLE_ID },
  { name: 'Purchase Orders',       id: PURCHASE_ORDERS.TABLE_ID },
  { name: 'Installation Logs',     id: INSTALLATION_LOGS.TABLE_ID },
  { name: 'Handover Sheets',       id: HANDOVER_SHEETS.TABLE_ID },
  { name: 'Calendar Events',       id: CALENDAR_EVENTS.TABLE_ID },
  { name: 'Follow-Up Log',         id: FOLLOW_UP_LOG.TABLE },
  { name: 'Production Timesheets', id: PRODUCTION_TIMESHEETS.TABLE },
  { name: 'Payables',              id: PAYABLES.TABLE },
  { name: 'Receivables',           id: RECEIVABLES.TABLE },
  { name: 'Clients',               id: CLIENTS.TABLE_ID },
  { name: 'End Users',             id: END_USERS.TABLE_ID },
  { name: 'Announcements',         id: ANNOUNCEMENTS.TABLE_ID },
  { name: 'System Logs',           id: SYSTEM_LOGS.TABLE_ID },
  { name: 'Failed Requests',       id: FAILED_REQUESTS.TABLE_ID },
]

const CONFIRM = process.argv.includes('--confirm')
const AUTH = { Authorization: `Bearer ${API_KEY}` }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function listAllIds(tableId: string): Promise<string[]> {
  const ids: string[] = []
  let offset: string | undefined
  do {
    const params = new URLSearchParams({ fields: '', pageSize: '100' })
    // fetch only ids — omit fields to keep payload small
    if (offset) params.set('offset', offset)
    const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}?${params}`, {
      headers: AUTH,
    })
    if (!res.ok) throw new Error(`list ${tableId} failed: ${res.status} ${await res.text()}`)
    const data = (await res.json()) as { records: { id: string }[]; offset?: string }
    ids.push(...data.records.map((r) => r.id))
    offset = data.offset
    if (offset) await sleep(220) // stay under 5 req/s
  } while (offset)
  return ids
}

async function deleteIds(tableId: string, ids: string[]): Promise<number> {
  let deleted = 0
  for (let i = 0; i < ids.length; i += 10) {
    const batch = ids.slice(i, i + 10)
    const params = new URLSearchParams()
    for (const id of batch) params.append('records[]', id)
    const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}?${params}`, {
      method: 'DELETE',
      headers: AUTH,
    })
    if (!res.ok) throw new Error(`delete ${tableId} failed: ${res.status} ${await res.text()}`)
    deleted += batch.length
    await sleep(220)
  }
  return deleted
}

async function run() {
  console.log(`\n⚠  Target base: ${BASE_ID}`)
  console.log(CONFIRM ? '   Mode: DELETE (irreversible)\n' : '   Mode: DRY RUN (no --confirm) — counts only\n')

  let total = 0
  for (const t of TABLES) {
    const ids = await listAllIds(t.id)
    total += ids.length
    if (!CONFIRM) {
      console.log(`  ${t.name.padEnd(24)} ${ids.length} record(s)`)
      continue
    }
    const n = ids.length ? await deleteIds(t.id, ids) : 0
    console.log(`  ✓ ${t.name.padEnd(24)} deleted ${n}`)
  }

  console.log(`\n${CONFIRM ? 'Done.' : `Would delete ${total} record(s).`} ` +
    (CONFIRM ? '' : 'Re-run with --confirm to delete.'))
  console.log('Kept: Task Templates, Team Members, Workers.\n')
  process.exit(0)
}

run().catch((e) => { console.error(e); process.exit(1) })
