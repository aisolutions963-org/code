import { createClient } from '@libsql/client'

const client = createClient({
  url: process.env.TURSO_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

client.execute('SELECT id, name, email, role, active, length(hashed_password) as pw_len FROM users')
  .then(r => { console.table(r.rows); process.exit(0) })
  .catch(e => { console.error(e.message); process.exit(1) })
