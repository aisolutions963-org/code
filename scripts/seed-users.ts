// Run with: npx tsx scripts/seed-users.ts
// Creates SQLite login accounts linked to existing Airtable Team Member records.
// Does NOT create new Airtable records — uses existing rec IDs to link.
import { hashPassword, createUser, getUserByEmail } from '../lib/db'

const USERS = [
  {
    name: 'Engr. Kanaan',
    email: 'Kanaanddd@gmail.com',
    password: 'change-this-password',
    role: 'superadmin',
    airtable_member_id: 'rectlE7SY6xUFtVl6',
  },
]

async function seed() {
  for (const u of USERS) {
    const existing = getUserByEmail(u.email)
    if (existing) {
      console.log(`⚠ Skipped (already exists): ${u.name} <${u.email}>`)
      continue
    }
    const hashed = await hashPassword(u.password)
    createUser({
      name: u.name,
      email: u.email,
      hashed_password: hashed,
      role: u.role,
      airtable_member_id: u.airtable_member_id,
    })
    console.log(`✓ Created: ${u.name} <${u.email}> [${u.role}]`)
  }
  console.log('\nDone. All users should change their password after first login.')
  process.exit(0)
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
