import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { hashPassword, getAllUsers, createUser } from '@/lib/db'
import { createTeamMember, deleteTeamMember } from '@/lib/airtable'
import { CreateUserSchema } from '@/lib/validation'

export const GET = requireRole('superadmin')(async () => {
  const users = await getAllUsers()
  return NextResponse.json({ users })
})

export const POST = requireRole('superadmin')(async (req: NextRequest) => {
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = CreateUserSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 },
    )
  }

  const { name, email, password, role, airtable_member_id: providedMemberId } = parsed.data
  const hashed = await hashPassword(password)

  // Step 1: create Airtable member first (or use provided ID)
  let airtable_member_id: string | undefined = providedMemberId
  if (!airtable_member_id) {
    try {
      airtable_member_id = await createTeamMember({ name, email, role })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Airtable error'
      return NextResponse.json({ error: `Failed to create team member: ${msg}` }, { status: 502 })
    }
  }

  // Step 2: create SQLite user — compensate by deleting Airtable member if this fails
  try {
    const user = await createUser({ name, email, hashed_password: hashed, role, airtable_member_id })
    const { hashed_password: _, ...safeUser } = user
    return NextResponse.json({ user: safeUser }, { status: 201 })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to create user'
    if (msg.includes('UNIQUE constraint')) {
      if (airtable_member_id && !providedMemberId) {
        await deleteTeamMember(airtable_member_id).catch(() => {})
      }
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 })
    }
    if (airtable_member_id && !providedMemberId) {
      await deleteTeamMember(airtable_member_id).catch(() => {})
    }
    throw error
  }
})
