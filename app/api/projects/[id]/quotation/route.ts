import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createProjectItem, createQuotation } from '@/lib/airtable'
import { CreateQuotationItemsSchema } from '@/lib/validation'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session || !['sed', 'manager', 'superadmin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = CreateQuotationItemsSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 },
    )
  }

  try {
    const results = []
    for (const item of parsed.data.items) {
      const projectItem = await createProjectItem({
        projectId: params.id,
        itemTypeId: item.itemTypeId,
        itemTypeName: item.itemTypeName,
        quantity: item.quantity,
      })
      const quotation = await createQuotation({
        projectId: params.id,
        projectItemId: projectItem.id,
        itemTypeName: item.itemTypeName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        description: item.description,
        notes: item.notes,
      })
      results.push({ projectItemId: projectItem.id, quotationId: quotation.id })
    }
    return NextResponse.json({ created: results.length, items: results }, { status: 201 })
  } catch (error) {
    console.error('POST /api/projects/[id]/quotation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create items' },
      { status: 500 },
    )
  }
}
