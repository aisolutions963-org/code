import db from './db'

export const DEPT_ROLE_MAP: Record<string, string> = {
  SED: 'sed',
  Fabrication: 'fabrication',
  Installation: 'installation',
  Manager: 'manager',
  Management: 'manager',
}

export const ROLE_DASHBOARD: Record<string, string> = {
  sed: '/dashboard/sed',
  fabrication: '/dashboard/fab',
  installation: '/dashboard/fix',
  manager: '/dashboard/mgr',
  superadmin: '/dashboard/superadmin',
}

export interface DBNotification {
  id: number
  recipient_role: string
  title: string
  body: string
  link: string
  read: number
  created_at: string
}

const RETENTION_DAYS = 30

const insertStmt = db.prepare(`
  INSERT INTO notifications (recipient_role, title, body, link)
  VALUES (@recipient_role, @title, @body, @link)
`)

const pruneStmt = db.prepare(
  `DELETE FROM notifications WHERE created_at < datetime('now', '-${RETENTION_DAYS} days')`,
)

export function createNotification(opts: {
  recipientRole: string
  title: string
  body?: string
  link?: string
}): void {
  try {
    insertStmt.run({
      recipient_role: opts.recipientRole,
      title: opts.title,
      body: opts.body ?? '',
      link: opts.link ?? '',
    })
    pruneStmt.run()
  } catch (err) {
    console.error('[Notifications] Insert failed:', err)
  }
}

export function getNotificationsForRole(role: string, limit = 50): DBNotification[] {
  return db
    .prepare(
      `SELECT * FROM notifications WHERE recipient_role = ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(role, limit) as DBNotification[]
}

export function getUnreadCountForRole(role: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) as cnt FROM notifications WHERE recipient_role = ? AND read = 0`)
    .get(role) as { cnt: number }
  return row.cnt
}

export function markNotificationRead(id: number): void {
  db.prepare(`UPDATE notifications SET read = 1 WHERE id = ?`).run(id)
}

export function markAllReadForRole(role: string): void {
  db.prepare(`UPDATE notifications SET read = 1 WHERE recipient_role = ?`).run(role)
}

// Dispatch "task ready" notifications for a list of tasks with their departments and shared body.
export function notifyTasksReady(
  tasks: { taskName: string; departments: string[] }[],
  body: string,
): void {
  for (const t of tasks) {
    const roles = t.departments
      .map((d) => DEPT_ROLE_MAP[d])
      .filter((r): r is string => Boolean(r))
    const uniqueRoles = Array.from(new Set(roles.length > 0 ? roles : ['manager']))
    for (const role of uniqueRoles) {
      createNotification({
        recipientRole: role,
        title: `New task ready: ${t.taskName}`,
        body,
        link: ROLE_DASHBOARD[role] ?? '/dashboard/sed',
      })
    }
  }
}
