// Run with: npm run db:reset
// WARNING: Drops and recreates the users table. All existing user data is lost.
// Fetches active Airtable Team Members and creates DB accounts with force_password_change = 1.
import { createClient } from '@libsql/client'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const BASE_URL = 'https://api.airtable.com/v0'
const BASE_ID = process.env.AIRTABLE_BASE_ID ?? 'app3dfYnArFbZ6dpy'
const API_KEY = process.env.AIRTABLE_API_KEY!
const TEAM_MEMBERS_TABLE = 'tbleyX0MkYf1OucMS'
const FIELD_NAME        = 'fldpVNN148goSwWNX'
const FIELD_SYSTEM_ROLE = 'fldv7Nx8RtYK7IJeq'
const FIELD_ACTIVE      = 'fldtcuYm3JoaSAaRc'
const FIELD_EMAIL       = 'fldblbST8aaAd93ZQ'

const DEFAULT_PASSWORD = 'TestPass2025'

const ROLE_MAP: Record<string, string> = {
  'SED':           'sed',
  'Manager':       'manager',
  'Superadmin':    'superadmin',
  'Fabrication':   'fabrication',
  'Installation':  'installation',
}

interface AirtableRecord {
  id: string
  fields: Record<string, unknown>
}

async function fetchAllTeamMembers(): Promise<AirtableRecord[]> {
  const all: AirtableRecord[] = []
  let offset: string | undefined
  do {
    const params = new URLSearchParams({
      filterByFormula: `{${FIELD_ACTIVE}} = 1`,
      returnFieldsByFieldId: 'true',
    })
    if (offset) params.set('offset', offset)
    const res = await fetch(`${BASE_URL}/${BASE_ID}/${TEAM_MEMBERS_TABLE}?${params}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    })
    if (!res.ok) throw new Error(`Airtable error ${res.status}: ${await res.text()}`)
    const data = await res.json() as { records: AirtableRecord[]; offset?: string }
    all.push(...data.records)
    offset = data.offset
  } while (offset)
  return all
}

async function reset() {
  if (!API_KEY) throw new Error('AIRTABLE_API_KEY env var is not set')

  const dbUrl = process.env.TURSO_URL ?? process.env.TURSO_DB_URL ?? 'file:data/users.db'
  const authToken = process.env.TURSO_AUTH_TOKEN ?? process.env.TURSO_DB_AUTH_TOKEN
  const c = createClient({ url: dbUrl, ...(authToken ? { authToken } : {}) })

  console.log('⚠  Dropping users table…')
  await c.execute('DROP TABLE IF EXISTS users')

  console.log('✓ Recreating users table…')
  await c.execute(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      hashed_password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('superadmin','manager','sed','fabrication','installation')),
      active INTEGER NOT NULL DEFAULT 1,
      force_password_change INTEGER NOT NULL DEFAULT 0,
      airtable_member_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)

  console.log('Fetching Airtable team members…')
  const members = await fetchAllTeamMembers()
  console.log(`Found ${members.length} active member(s)`)

  const hashed = await bcrypt.hash(DEFAULT_PASSWORD, 12)
  let created = 0
  let skipped = 0

  for (const m of members) {
    const name = typeof m.fields[FIELD_NAME] === 'string' ? m.fields[FIELD_NAME] as string : ''
    const email = typeof m.fields[FIELD_EMAIL] === 'string' ? (m.fields[FIELD_EMAIL] as string).toLowerCase().trim() : ''
    const systemRole = typeof m.fields[FIELD_SYSTEM_ROLE] === 'string' ? m.fields[FIELD_SYSTEM_ROLE] as string : ''
    const role = ROLE_MAP[systemRole]

    if (!email || !role) {
      console.log(`  ⚠ Skipped (no email or unknown role): ${name} [${systemRole}]`)
      skipped++
      continue
    }

    await c.execute({
      sql: `INSERT OR IGNORE INTO users (name, email, hashed_password, role, force_password_change, airtable_member_id)
            VALUES (?, ?, ?, ?, 1, ?)`,
      args: [name, email, hashed, role, m.id],
    })
    console.log(`  ✓ ${name} <${email}> [${role}]`)
    created++
  }

  console.log(`\nDone. ${created} user(s) created, ${skipped} skipped.`)
  console.log(`All users must change their password (default: ${DEFAULT_PASSWORD}) on first login.`)
  process.exit(0)
}

reset().catch((err) => {
  console.error(err)
  process.exit(1)
})
