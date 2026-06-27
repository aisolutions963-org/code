import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getActiveTeamMembersForSync } from '@/lib/airtable'
import { getAllUsers, createUser, updateUser, hashPassword } from '@/lib/db'

const ROLE_MAP: Record<string, string> = {
  'SED':           'sed',
  'Manager':       'manager',
  'Superadmin':    'superadmin',
  'Fabrication':   'fabrication',
  'Installation':  'installation',
}

export const GET = requireRole('superadmin')(async () => {
  const DEFAULT_PASSWORD = process.env.DEFAULT_USER_PASSWORD
  if (!DEFAULT_PASSWORD) {
    return NextResponse.json({ error: 'DEFAULT_USER_PASSWORD env var is not configured' }, { status: 500 })
  }

  const members = await getActiveTeamMembersForSync()

  const existingUsers = await getAllUsers()
  const byAirtableId = new Map(
    existingUsers
      .filter((u) => u.airtable_member_id)
      .map((u) => [u.airtable_member_id!, u]),
  )
  const byEmail = new Map(
    existingUsers.map((u) => [u.email.toLowerCase(), u]),
  )

  let added = 0
  let updated = 0

  for (const member of members) {
    const email = member.email.toLowerCase().trim()
    const role = ROLE_MAP[member.systemRole]
    if (!email || !role) continue

    const existing = byAirtableId.get(member.id) ?? byEmail.get(email)

    if (existing) {
      const needsUpdate =
        existing.name !== member.name ||
        existing.role !== role ||
        existing.active !== 1 ||
        existing.airtable_member_id !== member.id

      if (needsUpdate) {
        await updateUser(existing.id, { name: member.name, role, active: 1, airtable_member_id: member.id })
        updated++
      }
    } else {
      const hashed = await hashPassword(DEFAULT_PASSWORD)
      await createUser({ name: member.name, email, hashed_password: hashed, role, airtable_member_id: member.id })
      added++
    }
  }

  // Deactivate users whose Airtable member no longer appears in the active list
  const activeAirtableIds = new Set(members.map((m) => m.id))
  let deactivated = 0
  for (const user of existingUsers) {
    if (user.active === 1 && user.airtable_member_id && !activeAirtableIds.has(user.airtable_member_id)) {
      await updateUser(user.id, { active: 0 })
      deactivated++
    }
  }

  return NextResponse.json({ ok: true, added, updated, deactivated })
})
