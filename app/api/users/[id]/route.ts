import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { hashPassword, getUserById, updateUser, deleteUser, hardDeleteUser } from '@/lib/db'
import { updateTeamMember, createTeamMember } from '@/lib/airtable'
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

    const { name, email, password, role, active, airtable_member_id: providedAirtableId } = parsed.data

    const resolvedAirtableId = existing.airtable_member_id ?? undefined
    const syncName  = name  ?? existing.name
    const syncEmail = email ?? existing.email
    const syncRole  = role  ?? existing.role

    // Step 1: sync to Airtable
    let newAirtableId: string | undefined
    if (providedAirtableId) {
      // Caller explicitly linked to an existing Airtable record — just store it
      newAirtableId = providedAirtableId
    } else if (resolvedAirtableId) {
      // User already has an Airtable record — update it if identity fields changed
      const identityChanged =
        (name  !== undefined && name  !== existing.name)  ||
        (email !== undefined && email !== existing.email) ||
        (role  !== undefined && role  !== existing.role)
      if (identityChanged) {
        try {
          await updateTeamMember(resolvedAirtableId, { name: syncName, email: syncEmail, role: syncRole })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.includes('403') || msg.includes('ROW_DOES_NOT_EXIST')) {
            // Stale record ID — recreate in Airtable
            try {
              newAirtableId = await createTeamMember({ name: syncName, email: syncEmail, role: syncRole })
            } catch (createErr) {
              const createMsg = createErr instanceof Error ? createErr.message : 'Airtable error'
              return NextResponse.json({ error: `Failed to sync team member: ${createMsg}` }, { status: 502 })
            }
          } else {
            return NextResponse.json({ error: `Failed to sync team member: ${msg}` }, { status: 502 })
          }
        }
      }
    } else {
      // No Airtable record yet — create one now so this user becomes assignable
      try {
        newAirtableId = await createTeamMember({ name: syncName, email: syncEmail, role: syncRole })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Airtable error'
        return NextResponse.json({ error: `Failed to create team member: ${msg}` }, { status: 502 })
      }
    }

    // Step 2: update DB
    const updates: Parameters<typeof updateUser>[1] = {}
    if (name !== undefined) updates.name = name
    if (email !== undefined) updates.email = email
    if (role !== undefined) updates.role = role
    if (active !== undefined) updates.active = active
    if (password) updates.hashed_password = await hashPassword(password)
    if (newAirtableId) updates.airtable_member_id = newAirtableId

    try {
      await updateUser(id, updates)
    } catch (error) {
      // Best-effort rollback: if we updated Airtable but the DB write fails, revert Airtable
      if (resolvedAirtableId && !newAirtableId) {
        await updateTeamMember(resolvedAirtableId, {
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
  async (req: NextRequest, _session, { params }) => {
    const id = parseInt(params.id, 10)
    if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const existing = await getUserById(id)
    if (!existing) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const permanent = new URL(req.url).searchParams.get('permanent') === 'true'

    if (permanent) {
      await hardDeleteUser(id)
    } else {
      await deleteUser(id)
    }

    if (existing.airtable_member_id) {
      try {
        await updateTeamMember(existing.airtable_member_id, { active: false })
      } catch {
        // best-effort
      }
    }

    return NextResponse.json({ success: true })
  },
)
