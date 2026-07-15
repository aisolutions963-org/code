import { db } from './db'

export const DEPT_ROLE_MAP: Record<string, string> = {
  SED: 'sed',
  Fabrication: 'fabrication',
  Installation: 'installation',
  Manager: 'manager',
  Management: 'manager',
  Purchase: 'manager',
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
  recipient_user_id: number | null
  title: string
  body: string
  link: string
  read: number
  category: string
  created_at: string
}

const RETENTION_DAYS = 30

export async function createNotification(opts: {
  recipientRole: string
  recipientUserId?: number
  title: string
  body?: string
  link?: string
  category?: string
}): Promise<void> {
  try {
    const c = await db()
    await c.execute({
      sql: `INSERT INTO notifications (recipient_role, recipient_user_id, title, body, link, category) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [opts.recipientRole, opts.recipientUserId ?? null, opts.title, opts.body ?? '', opts.link ?? '', opts.category ?? 'default'],
    })
    await c.execute({
      sql: `DELETE FROM notifications WHERE created_at < datetime('now', '-${RETENTION_DAYS} days')`,
      args: [],
    })
  } catch (err) {
    console.error('[Notifications] Insert failed — notification lost:', {
      role: opts.recipientRole,
      title: opts.title,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// Per-user: role-wide (no user target) + user-specific
export async function getNotificationsForUser(role: string, userId: number, limit = 50): Promise<DBNotification[]> {
  const c = await db()
  const result = await c.execute({
    sql: `SELECT * FROM notifications
          WHERE recipient_role = ? AND (recipient_user_id IS NULL OR recipient_user_id = ?)
          ORDER BY created_at DESC LIMIT ?`,
    args: [role, userId, limit],
  })
  return result.rows.map((r) =>
    Object.fromEntries(result.columns.map((col, i) => [col, r[i]])) as unknown as DBNotification,
  )
}

export async function getUnreadCountForUser(role: string, userId: number): Promise<number> {
  const c = await db()
  const result = await c.execute({
    sql: `SELECT COUNT(*) as cnt FROM notifications
          WHERE recipient_role = ? AND (recipient_user_id IS NULL OR recipient_user_id = ?) AND read = 0`,
    args: [role, userId],
  })
  const r = result.rows[0]
  return r ? Number(r[0]) : 0
}

export async function markAllReadForUser(role: string, userId: number): Promise<void> {
  const c = await db()
  await c.execute({
    sql: `UPDATE notifications SET read = 1
          WHERE recipient_role = ? AND (recipient_user_id IS NULL OR recipient_user_id = ?)`,
    args: [role, userId],
  })
}

export async function getNotificationsForRole(role: string, limit = 50): Promise<DBNotification[]> {
  const c = await db()
  const result = await c.execute({
    sql: `SELECT * FROM notifications WHERE recipient_role = ? AND recipient_user_id IS NULL
          ORDER BY created_at DESC LIMIT ?`,
    args: [role, limit],
  })
  return result.rows.map((r) =>
    Object.fromEntries(result.columns.map((col, i) => [col, r[i]])) as unknown as DBNotification,
  )
}

export async function getUnreadCountForRole(role: string): Promise<number> {
  const c = await db()
  const result = await c.execute({
    sql: `SELECT COUNT(*) as cnt FROM notifications WHERE recipient_role = ? AND recipient_user_id IS NULL AND read = 0`,
    args: [role],
  })
  const r = result.rows[0]
  return r ? Number(r[0]) : 0
}

export async function markNotificationRead(id: number, role: string): Promise<void> {
  const c = await db()
  await c.execute({
    sql: `UPDATE notifications SET read = 1 WHERE id = ? AND recipient_role = ?`,
    args: [id, role],
  })
}

export async function markAllReadForRole(role: string): Promise<void> {
  const c = await db()
  await c.execute({
    sql: `UPDATE notifications SET read = 1 WHERE recipient_role = ? AND recipient_user_id IS NULL`,
    args: [role],
  })
}

export async function notifyTasksReady(
  tasks: { taskName: string; departments: string[] }[],
  body: string,
): Promise<void> {
  for (const t of tasks) {
    const roles = t.departments
      .map((d) => DEPT_ROLE_MAP[d])
      .filter((r): r is string => Boolean(r))
    const uniqueRoles = Array.from(new Set(roles.length > 0 ? roles : ['manager']))
    for (const role of uniqueRoles) {
      await createNotification({
        recipientRole: role,
        title: `New task ready: ${t.taskName}`,
        body,
        link: ROLE_DASHBOARD[role] ?? '/dashboard/sed',
      })
    }
  }
}
