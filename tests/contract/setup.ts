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
