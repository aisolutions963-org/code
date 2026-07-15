// Clears the app "cache" tables from a Turso DB, keeping login users and settings.
// Run: npx tsx scripts/clean-db.ts
// Loads .env.local, so it targets whatever TURSO_URL that file points at — check the
// printed url before proceeding.
import { config as loadEnv } from 'dotenv'
import { createClient } from '@libsql/client'

loadEnv({ path: '.env.local', override: true })

// Cache/transient tables cleared on reset. KEEPS: users, settings.
const TABLES = ['notifications', 'sed_projects', 'inactivity_alerts', 'metrics_snapshots']

async function run() {
  const url = process.env.TURSO_URL ?? process.env.TURSO_DB_URL
  const authToken = process.env.TURSO_AUTH_TOKEN ?? process.env.TURSO_DB_AUTH_TOKEN

  if (!url) {
    console.error('Set TURSO_URL (+ TURSO_AUTH_TOKEN) in .env.local first')
    process.exit(1)
  }

  console.log(`\nTarget Turso DB: ${url}\n`)
  const c = createClient({ url, ...(authToken ? { authToken } : {}) })

  for (const table of TABLES) {
    try {
      const { rowsAffected } = await c.execute(`DELETE FROM ${table}`)
      console.log(`  ✓ ${table.padEnd(20)} deleted ${rowsAffected}`)
    } catch (e) {
      // Table may not exist on an older/preview DB — report and continue
      console.log(`  – ${table.padEnd(20)} skipped (${e instanceof Error ? e.message : 'error'})`)
    }
  }

  console.log('\nDone. Kept: users, settings.')
  process.exit(0)
}

run().catch(e => { console.error(e); process.exit(1) })
