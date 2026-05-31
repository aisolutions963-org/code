import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/apiHandler'
import { getAllWorkers, createWorker } from '@/lib/airtable'

export const dynamic = 'force-dynamic'

const CreateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  fullName: z.string().max(100).optional(),
  nickname: z.string().max(50).optional(),
  role: z.string().max(50).optional(),
  active: z.boolean().optional().default(true),
})

export const GET = requireRole('manager', 'superadmin')(async () => {
  const workers = await getAllWorkers()
  return NextResponse.json({ workers })
})

export const POST = requireRole('superadmin')(async (req: NextRequest) => {
  const body = await req.json()
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }
  try {
    const worker = await createWorker(parsed.data)
    return NextResponse.json({ worker }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to create worker'
    console.error('[POST /api/workers]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
})
