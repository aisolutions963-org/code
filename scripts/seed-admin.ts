// Run with: npx tsx scripts/seed-admin.ts
import { hashPassword, createUser } from '../lib/db'

async function seed() {
  const hashed = await hashPassword('change-this-password')
  createUser({
    name: 'Kanaan',
    email: 'admin@woodwings.com',
    hashed_password: hashed,
    role: 'superadmin',
  })
  console.log('Superadmin created. Change password on first login.')
  process.exit(0)
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
