import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/apiHandler'
import { updateWorker, deleteWorker } from '@/lib/airtable'

export const dynamic = 'force-dynamic'

const UpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  fullName: z.string().max(100).optional(),
  nickname: z.string().max(50).optional(),
  role: z.string().max(50).optional(),
  active: z.boolean().optional(),
})

type Context = { params: { id: string } }

export const PATCH = requireRole<Context>('superadmin')(async (req: NextRequest, _session, ctx) => {
  const { id } = ctx.params
  const body = await req.json()
  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }
  const worker = await updateWorker(id, parsed.data)
  return NextResponse.json({ worker })
})

export const DELETE = requireRole<Context>('superadmin')(async (_req, _session, ctx) => {
  const { id } = ctx.params
  await deleteWorker(id)
  return NextResponse.json({ success: true })
})
