import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { TASKS, TEAM_MEMBERS } from '@/lib/fieldMap'
import { getAllUsers } from '@/lib/db'

export const dynamic = 'force-dynamic'

const BASE_ID = process.env.AIRTABLE_BASE_ID!
const API_KEY = process.env.AIRTABLE_API_KEY!

interface RawTask {
  id: string
  fields: Record<string, unknown>
}

async function fetchTeamMemberEmailMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  let offset: string | undefined
  do {
    const params = new URLSearchParams({ returnFieldsByFieldId: 'true' })
    params.append('fields[]', TEAM_MEMBERS.NAME)
    params.append('fields[]', TEAM_MEMBERS.AIRTABLE_EMAIL)
    if (offset) params.set('offset', offset)
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${TEAM_MEMBERS.TABLE_ID}?${params}`,
      { headers: { Authorization: `Bearer ${API_KEY}` }, cache: 'no-store' },
    )
    if (!res.ok) break
    const data = await res.json() as { records: { id: string; fields: Record<string, unknown> }[]; offset?: string }
    for (const r of data.records) {
      const email = (r.fields[TEAM_MEMBERS.AIRTABLE_EMAIL] as string | undefined)?.toLowerCase()
      if (email) map.set(r.id, email)
    }
    offset = data.offset
  } while (offset)
  return map
}

async function fetchActiveTasks(): Promise<RawTask[]> {
  const records: RawTask[] = []
  let offset: string | undefined
  const formula = encodeURIComponent(`AND({${TASKS.STATUS}}!="Locked", {${TASKS.STATUS}}!="Completed")`)
  do {
    const params = new URLSearchParams({ returnFieldsByFieldId: 'true', filterByFormula: formula })
    params.append('fields[]', TASKS.TASK_NAME)
    params.append('fields[]', TASKS.STATUS)
    params.append('fields[]', TASKS.DEPARTMENT)
    params.append('fields[]', TASKS.ASSIGNED_TO)
    params.append('fields[]', TASKS.PROJECT_ID)
    params.append('fields[]', TASKS.PROJECT)
    if (offset) params.set('offset', offset)
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${TASKS.TABLE_ID}?${params}`,
      { headers: { Authorization: `Bearer ${API_KEY}` }, cache: 'no-store' },
    )
    if (!res.ok) break
    const data = await res.json() as { records: RawTask[]; offset?: string }
    records.push(...data.records)
    offset = data.offset
  } while (offset)
  return records
}

const ROLE_ORDER: Record<string, number> = {
  superadmin: 0, manager: 1, sed: 2, fabrication: 3, installation: 4,
}

export const GET = requireRole('superadmin')(async () => {
  const [tasks, allUsers, teamMemberEmailMap] = await Promise.all([
    fetchActiveTasks(),
    getAllUsers(),
    fetchTeamMemberEmailMap(),
  ])

  const users = allUsers.filter((u) => Number(u.active) === 1)

  // Build map: email → DB user
  const emailToUser = new Map<string, { name: string; role: string; userId: number }>()
  for (const u of users) {
    emailToUser.set(u.email.toLowerCase(), { name: u.name, role: u.role, userId: u.id })
  }

  // Build map: Team Members record ID → DB user (via email)
  const memberMap = new Map<string, { name: string; role: string; userId: number }>()
  for (const [recId, email] of teamMemberEmailMap) {
    const dbUser = emailToUser.get(email)
    if (dbUser) memberMap.set(recId, dbUser)
  }

  // Pre-build role-based user lists for dept-attributed tasks
  const managerUsers  = users.filter((u) => u.role === 'manager')
  const installUsers  = users.filter((u) => u.role === 'installation')

  type GroupEntry = {
    name: string; role: string; userId: number
    tasks: { id: string; taskName: string; status: string; department: string[]; projectRef: string; projectRecordId: string }[]
  }
  const groupMap = new Map<string, GroupEntry>()

  function ensureGroup(key: string, user: { name: string; role: string; id: number }) {
    if (!groupMap.has(key)) {
      groupMap.set(key, { name: user.name, role: user.role, userId: user.id, tasks: [] })
    }
  }

  for (const t of tasks) {
    const f = t.fields
    const assignedArr = f[TASKS.ASSIGNED_TO]
    const assignedId = Array.isArray(assignedArr) ? (assignedArr[0] as string) : undefined
    const user = assignedId ? memberMap.get(assignedId) : undefined

    const dept = Array.isArray(f[TASKS.DEPARTMENT]) ? (f[TASKS.DEPARTMENT] as string[]) : []
    const taskEntry = {
      id: t.id,
      taskName: (f[TASKS.TASK_NAME] as string) ?? '',
      status: (f[TASKS.STATUS] as string) ?? '',
      department: dept,
      projectRef: (f[TASKS.PROJECT_ID] as string) ?? '',
      projectRecordId: Array.isArray(f[TASKS.PROJECT]) ? (f[TASKS.PROJECT] as string[])[0] ?? '' : (f[TASKS.PROJECT] as string) ?? '',
    }

    if (user && assignedId) {
      // Individually assigned — group under that person
      ensureGroup(assignedId, { name: user.name, role: user.role, id: user.userId })
      groupMap.get(assignedId)!.tasks.push(taskEntry)
    } else {
      // No individual assignment — attribute by department role
      const isManagerTask = dept.some((d) => d === 'Manager' || d === 'Management')
      const isInstallTask = dept.includes('Installation')
      let attributed = false

      if (isManagerTask) {
        for (const u of managerUsers) {
          const key = `mgr:${u.id}`
          ensureGroup(key, { name: u.name, role: u.role, id: u.id })
          groupMap.get(key)!.tasks.push(taskEntry)
          attributed = true
        }
      }
      if (isInstallTask && !isManagerTask) {
        for (const u of installUsers) {
          const key = `install:${u.id}`
          ensureGroup(key, { name: u.name, role: u.role, id: u.id })
          groupMap.get(key)!.tasks.push(taskEntry)
          attributed = true
        }
      }
      if (!attributed) {
        // Truly unassigned — skip
      }
    }
  }

  // Sort groups by role order
  const groups = Array.from(groupMap.values())
    .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9))

  return NextResponse.json({ groups })
})
