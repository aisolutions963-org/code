// Run: npx tsx scripts/check-login.ts
import { getUserByEmail, verifyPassword } from '../lib/db'

async function check() {
  const email = 'superadmin@woodwings.test'
  const password = 'TestPass2025'

  const u = await getUserByEmail(email)
  if (!u) { console.log('USER NOT FOUND in DB'); process.exit(0) }

  console.log('Found user:', u.email, '| role:', u.role, '| active:', u.active)
  const ok = await verifyPassword(password, u.hashed_password)
  console.log('Password "TestPass2025" matches:', ok)
  process.exit(0)
}

check().catch(e => { console.error(e); process.exit(1) })
