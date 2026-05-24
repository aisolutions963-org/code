import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createProjectItem, createQuotation, generateItemTasksForProject, getProjectById, updateProject } from '@/lib/airtable'
import { notifyTasksReady } from '@/lib/notifications'
import { CreateQuotationItemsSchema } from '@/lib/validation'
import { PROJECTS } from '@/lib/fieldMap'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
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
    const messages = parsed.error.issues.map((i) => i.message).filter(Boolean)
    console.error('[QUOTATION] Validation failed:', JSON.stringify(parsed.error.issues))
    return NextResponse.json(
      { error: messages[0] ?? parsed.error.issues[0]?.code ?? 'Validation failed' },
      { status: 400 },
    )
  }

  try {
    // Set quotation number on the project and determine the reference.
    // If the caller provides a reference explicitly, use it as-is.
    // Otherwise auto-assign R0 only when no reference exists yet.
    const project = await getProjectById(id)
    const currentRef = project.quotationReference

    let nextRef: string
    if (parsed.data.quotationReference) {
      nextRef = parsed.data.quotationReference
    } else if (!currentRef) {
      nextRef = 'R0'
    } else {
      nextRef = currentRef
    }

    const projectUpdate: Record<string, unknown> = {
      [PROJECTS.QUOTATION_NUMBER]: parsed.data.quotationNumber,
      [PROJECTS.QUOTATION_REFERENCE]: nextRef,
    }
    if (parsed.data.totalAmountToPay !== undefined) {
      projectUpdate[PROJECTS.PROJECT_TOTAL_COST] = parsed.data.totalAmountToPay
    }
    await updateProject(id, projectUpdate)

    const results = []
    for (const item of parsed.data.items) {
      const projectItem = await createProjectItem({
        projectId: id,
        itemName: item.itemName,
        quantity: item.quantity,
      })
      const quotation = await createQuotation({
        projectId: id,
        projectItemId: projectItem.id,
        itemName: item.itemName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        description: item.description,
        notes: item.notes,
        quotationDate: parsed.data.quotationDate,
      })
      results.push({ projectItemId: projectItem.id, quotationId: quotation.id })

      // Fire-and-forget: generate per-item tasks and notify departments
      ;(async () => {
        try {
          const { todoTemplates } = await generateItemTasksForProject(id, projectItem.id)
          if (todoTemplates.length > 0) {
            notifyTasksReady(
              todoTemplates.map((t) => ({ taskName: t.taskName, departments: t.department })),
              `New item ready: ${item.itemName}`,
            )
          }
        } catch (err) {
          console.error('[QUOTATION] Item task generation failed for item', projectItem.id, ':', err)
        }
      })()
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
