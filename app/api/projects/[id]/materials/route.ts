import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { createMaterials, getMaterialsByProject } from '@/lib/airtable'
import { CreateMaterialsSchema } from '@/lib/validation'

export const GET = requireRole('manager', 'fabrication', 'superadmin')(
  async (_req: NextRequest, _session, { params }) => {
    try {
      const materials = await getMaterialsByProject(params.id)
      return NextResponse.json({ materials })
    } catch (error) {
      console.error('GET /api/projects/[id]/materials error:', error)
      return NextResponse.json({ error: 'Failed to fetch materials' }, { status: 500 })
    }
  },
)

export const POST = requireRole('sed', 'manager', 'fabrication', 'superadmin')(
  async (req: NextRequest, _session, { params }) => {
    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = CreateMaterialsSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 },
      )
    }

    try {
      const materials = await createMaterials(params.id, parsed.data.items)
      return NextResponse.json({ created: materials.length, materials })
    } catch (error) {
      console.error('POST /api/projects/[id]/materials error:', error)
      return NextResponse.json({ error: 'Failed to create materials' }, { status: 500 })
    }
  },
)
