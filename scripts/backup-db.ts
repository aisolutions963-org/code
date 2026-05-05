import path from 'path'
import fs from 'fs'

const DB_PATH = path.resolve(process.cwd(), 'data', 'users.db')
const BACKUP_DIR = path.resolve(process.cwd(), 'data', 'backups')
const MAX_BACKUPS = 7

async function backup(): Promise<void> {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found at ${DB_PATH}`)
    process.exit(1)
  }

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(BACKUP_DIR, `users-${timestamp}.db`)

  fs.copyFileSync(DB_PATH, backupPath)
  console.log(`Backup created: ${backupPath}`)

  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('users-') && f.endsWith('.db'))
    .sort()

  if (files.length > MAX_BACKUPS) {
    const toDelete = files.slice(0, files.length - MAX_BACKUPS)
    for (const f of toDelete) {
      fs.unlinkSync(path.join(BACKUP_DIR, f))
      console.log(`Removed old backup: ${f}`)
    }
  }
}

backup().catch(console.error)
