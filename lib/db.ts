import { createClient, Client, ResultSet } from '@libsql/client'
import bcrypt from 'bcryptjs'

let _client: Client | null = null
let _initPromise: Promise<void> | null = null

function getClient(): Client {
  if (!_client) {
    const url = process.env.TURSO_URL ?? process.env.TURSO_DB_URL ?? 'file:data/users.db'
    const authToken = process.env.TURSO_AUTH_TOKEN ?? process.env.TURSO_DB_AUTH_TOKEN
    _client = createClient({ url, ...(authToken ? { authToken } : {}) })
  }
  return _client
}

async function initDB(): Promise<void> {
  const c = getClient()
  await c.batch(
    [
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        hashed_password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('superadmin','manager','sed','fabrication','installation')),
        active INTEGER NOT NULL DEFAULT 1,
        airtable_member_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS metrics_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        request_count INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0,
        error_rate REAL NOT NULL DEFAULT 0,
        avg_latency_ms INTEGER NOT NULL DEFAULT 0,
        airtable_failures INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ok'
      )`,
      `CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipient_role TEXT NOT NULL,
        recipient_user_id INTEGER,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        link TEXT NOT NULL DEFAULT '',
        read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS sed_projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_airtable_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        UNIQUE(project_airtable_id, user_id),
        FOREIGN KEY(user_id) REFERENCES users(id)
      )`,
      `INSERT OR IGNORE INTO settings (key, value) VALUES ('accountant_email', 'aisolutions963@gmail.com')`,
    ],
    'write',
  )
  // Migrate existing notifications table: add recipient_user_id if missing
  try {
    await c.execute(`ALTER TABLE notifications ADD COLUMN recipient_user_id INTEGER`)
  } catch {
    // Column already exists — expected on fresh DBs or after first migration
  }
}

export async function db(): Promise<Client> {
  if (!_initPromise) {
    _initPromise = initDB()
  }
  await _initPromise
  return getClient()
}

function row<T>(result: ResultSet, index = 0): T | undefined {
  const r = result.rows[index]
  if (!r) return undefined
  return Object.fromEntries(result.columns.map((col, i) => [col, r[i]])) as unknown as T
}

function rows<T>(result: ResultSet): T[] {
  return result.rows.map((r) =>
    Object.fromEntries(result.columns.map((col, i) => [col, r[i]])) as unknown as T,
  )
}

export interface DBUser {
  id: number
  name: string
  email: string
  hashed_password: string
  role: string
  active: number
  airtable_member_id: string | null
  created_at: string
  updated_at: string
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function getUserByEmail(email: string): Promise<DBUser | undefined> {
  const c = await db()
  const result = await c.execute({
    sql: 'SELECT * FROM users WHERE email = ? AND active = 1',
    args: [email],
  })
  return row<DBUser>(result)
}

export async function getUserById(id: number): Promise<DBUser | undefined> {
  const c = await db()
  const result = await c.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] })
  return row<DBUser>(result)
}

export async function getAllUsers(): Promise<Omit<DBUser, 'hashed_password'>[]> {
  const c = await db()
  const result = await c.execute(
    'SELECT id, name, email, role, active, airtable_member_id, created_at, updated_at FROM users',
  )
  return rows<Omit<DBUser, 'hashed_password'>>(result)
}

export async function getUsersByRole(role: string): Promise<Omit<DBUser, 'hashed_password'>[]> {
  const c = await db()
  const result = await c.execute({
    sql: 'SELECT id, name, email, role, active, airtable_member_id, created_at, updated_at FROM users WHERE role = ? AND active = 1',
    args: [role],
  })
  return rows<Omit<DBUser, 'hashed_password'>>(result)
}

export async function createUser(user: {
  name: string
  email: string
  hashed_password: string
  role: string
  airtable_member_id?: string
}): Promise<DBUser> {
  const c = await db()
  const result = await c.execute({
    sql: `INSERT INTO users (name, email, hashed_password, role, airtable_member_id)
          VALUES (?, ?, ?, ?, ?)`,
    args: [user.name, user.email, user.hashed_password, user.role, user.airtable_member_id ?? null],
  })
  const insertId = result.lastInsertRowid
  if (insertId === undefined) throw new Error('createUser: insert returned no id')
  const fetched = await c.execute({
    sql: 'SELECT * FROM users WHERE id = ?',
    args: [insertId],
  })
  return row<DBUser>(fetched)!
}

export async function updateUser(
  id: number,
  fields: {
    name?: string
    email?: string
    hashed_password?: string
    role?: string
    active?: number
    airtable_member_id?: string
  },
): Promise<void> {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined)
  if (!entries.length) return
  const c = await db()
  const setClauses = entries.map(([k]) => `${k} = ?`).join(', ')
  const args = [...entries.map(([, v]) => v), id]
  await c.execute({
    sql: `UPDATE users SET ${setClauses}, updated_at = datetime('now') WHERE id = ?`,
    args,
  })
}

export async function deleteUser(id: number): Promise<void> {
  const c = await db()
  await c.execute({
    sql: `UPDATE users SET active = 0, updated_at = datetime('now') WHERE id = ?`,
    args: [id],
  })
}

export async function getUserByAirtableMemberId(memberId: string): Promise<DBUser | undefined> {
  const c = await db()
  const result = await c.execute({
    sql: 'SELECT * FROM users WHERE airtable_member_id = ? AND active = 1',
    args: [memberId],
  })
  return row<DBUser>(result)
}

export async function addSedProjectMapping(projectAirtableId: string, userId: number): Promise<void> {
  const c = await db()
  await c.execute({
    sql: 'INSERT OR IGNORE INTO sed_projects (project_airtable_id, user_id) VALUES (?, ?)',
    args: [projectAirtableId, userId],
  })
}

export async function getSedProjectIdsByUserId(userId: number): Promise<string[]> {
  const c = await db()
  const result = await c.execute({
    sql: 'SELECT project_airtable_id FROM sed_projects WHERE user_id = ?',
    args: [userId],
  })
  return rows<{ project_airtable_id: string }>(result).map((r) => r.project_airtable_id)
}

export async function getSetting(key: string): Promise<string | undefined> {
  const c = await db()
  const result = await c.execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: [key] })
  return (row<{ value: string }>(result))?.value
}

export async function setSetting(key: string, value: string): Promise<void> {
  const c = await db()
  await c.execute({
    sql: `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    args: [key, value],
  })
}

// Raw client for notifications and metrics (already awaits init internally)
export { db as getDB }
