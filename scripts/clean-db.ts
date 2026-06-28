// Clears notifications (and optionally sessions) from a Turso DB.
// Run: npx tsx scripts/clean-db.ts
// Requires TURSO_URL + TURSO_AUTH_TOKEN set as env vars before running.
import { createClient } from '@libsql/client'

async function run() {
  const url = process.env.TURSO_URL
  const authToken = process.env.TURSO_AUTH_TOKEN

  if (!url) {
    console.error('Set TURSO_URL and TURSO_AUTH_TOKEN as env vars first')
    process.exit(1)
  }

  const c = createClient({ url, ...(authToken ? { authToken } : {}) })

  const { rowsAffected: notifs } = await c.execute('DELETE FROM notifications')
  console.log(`✓ Deleted ${notifs} notification(s)`)

  console.log('\nDone.')
  process.exit(0)
}

run().catch(e => { console.error(e); process.exit(1) })
