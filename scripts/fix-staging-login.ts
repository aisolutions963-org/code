// Fixes superadmin login on staging Turso DB
// Run: npx tsx scripts/fix-staging-login.ts
// Requires TURSO_URL + TURSO_AUTH_TOKEN set as env vars before running
import { hashPassword, getUserByEmail, updateUser } from '../lib/db'
import { createClient } from '@libsql/client'
import bcrypt from 'bcryptjs'

const SUPERADMINS = [
  { email: 'kanaanddd@gmail.com', name: 'Engr. Kanaan' },
  { email: 'admin@woodwings.com',  name: 'Admin' },
]
const PASSWORD = 'TestPass2025'

async function run() {
  if (!process.env.TURSO_URL) {
    console.error('Set TURSO_URL and TURSO_AUTH_TOKEN as env vars first')
    process.exit(1)
  }

  const hashed = await hashPassword(PASSWORD)
  console.log('Password hashed ✓')

  for (const { email, name } of SUPERADMINS) {
    const existing = await getUserByEmail(email)
    if (existing) {
      await updateUser(existing.id, { hashed_password: hashed })
      console.log(`Updated: ${email}`)
    } else {
      // Direct insert for new accounts
      const client = createClient({
        url: process.env.TURSO_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN,
      })
      await client.execute({
        sql: `INSERT INTO users (name, email, hashed_password, role, active) VALUES (?, ?, ?, 'superadmin', 1)`,
        args: [name, email, hashed],
      })
      console.log(`Created: ${email}`)
    }
  }

  console.log(`\nDone. Both accounts now work with password: ${PASSWORD}`)
  process.exit(0)
}

run().catch(e => { console.error(e); process.exit(1) })
