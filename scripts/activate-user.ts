import { createClient } from '@libsql/client'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import bcrypt from 'bcryptjs'

// Load .env.local manually
try {
  const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const [k, ...rest] = line.split('=')
    const key = k?.trim()
    const val = rest.join('=').trim()
    if (key && val && !key.startsWith('#') && !process.env[key]) {
      process.env[key] = val
    }
  }
} catch { /* ignore if missing */ }

const url = process.env.TURSO_URL
const authToken = process.env.TURSO_AUTH_TOKEN
const email = process.argv[2]
const password = process.argv[3]

if (!url || !authToken) {
  console.error('TURSO_URL and TURSO_AUTH_TOKEN must be set (uncomment them in .env.local)')
  process.exit(1)
}
if (!email || !password) {
  console.error('Usage: npx tsx scripts/activate-user.ts <email> <password>')
  process.exit(1)
}

const client = createClient({ url, authToken })

client.execute({
  sql: 'SELECT id, email, role, active FROM users WHERE email = ?',
  args: [email],
}).then(r => {
  if (r.rows.length === 0) {
    console.log('NOT FOUND in DB')
  } else {
    console.table(r.rows)
  }
  process.exit(0)
}).catch(e => {
  console.error(e.message)
  process.exit(1)
})
