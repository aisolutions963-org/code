// Run with: npx tsx scripts/reset-test-passwords.ts
// Resets all mock test account passwords to TestPass2025
import { hashPassword, updateUser, getUserByEmail } from '../lib/db'

const EMAILS = [
  'superadmin@woodwings.test',
  'manager@woodwings.test',
  'sed@woodwings.test',
  'fab@woodwings.test',
  'install@woodwings.test',
]

async function run() {
  const hashed = await hashPassword('TestPass2025')
  for (const email of EMAILS) {
    const u = await getUserByEmail(email)
    if (!u) {
      console.log(`Not found: ${email}`)
      continue
    }
    await updateUser(u.id, { hashed_password: hashed })
    console.log(`Reset: ${email}`)
  }
  console.log('\nDone. All test accounts now use password: TestPass2025')
  process.exit(0)
}

run().catch((err) => { console.error(err); process.exit(1) })
