import Database from 'better-sqlite3'
import path from 'path'
import bcrypt from 'bcryptjs'

const db = new Database(path.join(process.cwd(), 'data', 'users.db'))

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    hashed_password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN (
      'superadmin','manager','sed','fabrication','installation'
    )),
    active INTEGER NOT NULL DEFAULT 1,
    airtable_member_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`)

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

export function getUserByEmail(email: string): DBUser | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email) as DBUser | undefined
}

export function getUserById(id: number): DBUser | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as DBUser | undefined
}

export function getAllUsers(): Omit<DBUser, 'hashed_password'>[] {
  return db
    .prepare('SELECT id, name, email, role, active, airtable_member_id, created_at, updated_at FROM users')
    .all() as Omit<DBUser, 'hashed_password'>[]
}

export function createUser(user: {
  name: string
  email: string
  hashed_password: string
  role: string
  airtable_member_id?: string
}): DBUser {
  const stmt = db.prepare(`
    INSERT INTO users (name, email, hashed_password, role, airtable_member_id)
    VALUES (@name, @email, @hashed_password, @role, @airtable_member_id)
  `)
  const result = stmt.run({ ...user, airtable_member_id: user.airtable_member_id ?? null })
  return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as DBUser
}

export function updateUser(
  id: number,
  fields: {
    name?: string
    email?: string
    hashed_password?: string
    role?: string
    active?: number
    airtable_member_id?: string
  },
): void {
  const updates = Object.entries(fields)
    .map(([k]) => `${k} = @${k}`)
    .join(', ')
  db.prepare(`UPDATE users SET ${updates}, updated_at = datetime('now') WHERE id = @id`).run({
    ...fields,
    id,
  })
}

export function deleteUser(id: number): void {
  db.prepare(`UPDATE users SET active = 0, updated_at = datetime('now') WHERE id = ?`).run(id)
}

export default db
