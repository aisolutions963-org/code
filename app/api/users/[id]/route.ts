import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { hashPassword, getUserById, updateUser, deleteUser } from '@/lib/db'
import { updateTeamMember } from '@/lib/airtable'
import { UpdateUserSchema } from '@/lib/validation'

export const PATCH = requireRole('superadmin')(
  async (req: NextRequest, _session, { params }) => {
    const id = parseInt(params.id, 10)
    if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const existing = await getUserById(id)
    if (!existing) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = UpdateUserSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 },
      )
    }

    const { name, email, password, role, active } = parsed.data
    const identityChanged = existing.airtable_member_id && (
      (name  !== undefined && name  !== existing.name)  ||
      (email !== undefined && email !== existing.email) ||
      (role  !== undefined && role  !== existing.role)
    )

    // Step 1: update Airtable first if identity fields are changing
    if (identityChanged) {
      try {
        await updateTeamMember(existing.airtable_member_id!, { name, email, role })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Airtable error'
        return NextResponse.json({ error: `Failed to sync team member: ${msg}` }, { status: 502 })
      }
    }

    // Step 2: update SQLite — compensate by reverting Airtable if this fails
    const updates: Parameters<typeof updateUser>[1] = {}
    if (name !== undefined) updates.name = name
    if (email !== undefined) updates.email = email
    if (role !== undefined) updates.role = role
    if (active !== undefined) updates.active = active
    if (password) updates.hashed_password = await hashPassword(password)

    try {
      await updateUser(id, updates)
    } catch (error) {
      // Compensate: revert Airtable to original values
      if (identityChanged) {
        await updateTeamMember(existing.airtable_member_id!, {
          name: existing.name,
          email: existing.email,
          role: existing.role,
        }).catch(() => {})
      }
      throw error
    }

    const updated = (await getUserById(id))!
    const { hashed_password: _, ...safeUser } = updated
    return NextResponse.json({ user: safeUser })
  },
)

export const DELETE = requireRole('superadmin')(
  async (_req: NextRequest, _session, { params }) => {
    const id = parseInt(params.id, 10)
    if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const existing = await getUserById(id)
    if (!existing) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    await deleteUser(id)

    if (existing.airtable_member_id) {
      try {
        await updateTeamMember(existing.airtable_member_id, { active: false })
      } catch {
        // Soft-delete failure is best-effort — user is already removed from system
      }
    }

    return NextResponse.json({ success: true })
  },
)
