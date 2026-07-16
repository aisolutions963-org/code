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

// ─── Arabic localization for fabrication & installation notifications ──────────
// The fab (/dashboard/fab) and installation (/dashboard/fix) dashboards are Arabic (RTL),
// so notifications delivered to those two roles are shown in Arabic. Every other role
// (sed / manager / superadmin) keeps the English text.
export function isArabicRole(role: string): boolean {
  return role === 'fabrication' || role === 'installation'
}

// Pick the Arabic vs English {title, body} for a given recipient role.
export function pickForRole(
  role: string,
  ar: { title: string; body: string },
  en: { title: string; body: string },
): { title: string; body: string } {
  return isArabicRole(role) ? ar : en
}

const AR_NEW_TASK = 'مهمة جديدة'
const AR_CHECK_DASHBOARD: Record<string, string> = {
  fabrication: 'راجع التفاصيل في لوحة التصنيع.',
  installation: 'راجع التفاصيل في لوحة التركيب.',
}

// Arabic "new task ready" text for a fabrication/installation recipient, driven by the new
// task's own Arabic name + Arabic instructions (falls back to the English name and a
// dashboard pointer when the Arabic fields are empty).
export function arTaskReady(
  role: string,
  opts: { taskName: string; arabicName?: string | null; arabicInstructions?: string[] | string | null },
): { title: string; body: string } {
  const name = (opts.arabicName ?? '').trim() || opts.taskName
  const instrArr = Array.isArray(opts.arabicInstructions)
    ? opts.arabicInstructions
    : opts.arabicInstructions ? [opts.arabicInstructions] : []
  const instructions = instrArr.filter(Boolean).join(' ').trim()
  return {
    title: `${AR_NEW_TASK}: ${name}`,
    body: instructions || AR_CHECK_DASHBOARD[role] || AR_CHECK_DASHBOARD.fabrication,
  }
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

// Delete every notification visible to this user (role-wide + user-specific), regardless
// of read state or age. Powers the "Clear all" button.
export async function deleteAllForUser(role: string, userId: number): Promise<number> {
  const c = await db()
  const res = await c.execute({
    sql: `DELETE FROM notifications
          WHERE recipient_role = ? AND (recipient_user_id IS NULL OR recipient_user_id = ?)`,
    args: [role, userId],
  })
  return Number(res.rowsAffected ?? 0)
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
  tasks: { taskName: string; departments: string[]; arabicName?: string | null; arabicInstructions?: string[] | string | null }[],
  body: string,
): Promise<void> {
  for (const t of tasks) {
    const roles = t.departments
      .map((d) => DEPT_ROLE_MAP[d])
      .filter((r): r is string => Boolean(r))
    const uniqueRoles = Array.from(new Set(roles.length > 0 ? roles : ['manager']))
    for (const role of uniqueRoles) {
      // Fabrication/installation get the task's Arabic name + instructions; others English.
      const text = isArabicRole(role)
        ? arTaskReady(role, t)
        : { title: `New task ready: ${t.taskName}`, body }
      await createNotification({
        recipientRole: role,
        title: text.title,
        body: text.body,
        link: ROLE_DASHBOARD[role] ?? '/dashboard/sed',
      })
    }
  }
}
