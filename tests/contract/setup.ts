import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Local convenience: hydrate process.env from .env.local so `npm run test:contract`
// works without extra flags. In CI the credentials arrive as repository secrets and
// already-set variables always win, so this is a no-op there.
const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!match) continue
    const [, key, rawValue] = match
    if (process.env[key]) continue
    process.env[key] = rawValue.replace(/^["']|["']$/g, '')
  }
}

// Importing @/lib/airtable runs validateEnv() at module load, which THROWS if these are
// missing — so the integration suite (which imports it) used to error out on load instead
// of skipping when no real creds are present, failing CI on every run. Fill dummy values
// only when unset: real creds (CI secrets or .env.local) always win, and each suite's own
// hasCreds check rejects these dummies, so a dummy still results in a clean skip.
process.env.SESSION_SECRET ||= 'contract-suite-dummy-session-secret-32-characters-min'
process.env.AIRTABLE_API_KEY ||= 'test'
process.env.AIRTABLE_BASE_ID ||= 'test'
