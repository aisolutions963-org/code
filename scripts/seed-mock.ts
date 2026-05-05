// Run with: npx tsx scripts/seed-mock.ts
// Creates 5 test login accounts linked to mock Airtable team members.
// All users share the password: TestPass2025
import { hashPassword, createUser, getUserByEmail } from '../lib/db'

const USERS = [
  {
    name: 'Admin User',
    email: 'superadmin@woodwings.test',
    password: 'TestPass2025',
    role: 'superadmin',
    airtable_member_id: 'recTgXY0VsIKagVxO',
  },
  {
    name: 'Manager User',
    email: 'manager@woodwings.test',
    password: 'TestPass2025',
    role: 'manager',
    airtable_member_id: 'recy4b82RadpIWixW',
  },
  {
    name: 'SED User',
    email: 'sed@woodwings.test',
    password: 'TestPass2025',
    role: 'sed',
    airtable_member_id: 'recZfhSziKaDF30Kv',
  },
  {
    name: 'Fab User',
    email: 'fab@woodwings.test',
    password: 'TestPass2025',
    role: 'fabrication',
    airtable_member_id: 'recKWMYRCbqSwY3h9',
  },
  {
    name: 'Install User',
    email: 'install@woodwings.test',
    password: 'TestPass2025',
    role: 'installation',
    airtable_member_id: 'recvDNnUqCrND0Vgr',
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
  console.log('\nAll mock users created. Password for all: TestPass2025')
  process.exit(0)
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
