import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createProjectItem, createQuotation, generateItemTasksForProject, getProjectById, updateProject } from '@/lib/airtable'
import { notifyTasksReady } from '@/lib/notifications'
import { CreateQuotationItemsSchema } from '@/lib/validation'
import { PROJECTS } from '@/lib/fieldMap'

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
    // Set quotation number on the project and compute the reference revision
    const project = await getProjectById(params.id)
    const currentQN = project.quotationNumber
    const currentRef = project.quotationReference // e.g. "R1", "R2", or undefined

    let nextRef: string
    if (!currentRef || currentQN !== parsed.data.quotationNumber) {
      nextRef = 'R0'
    } else {
      const n = parseInt(currentRef.slice(1), 10)
      nextRef = `R${isNaN(n) ? 1 : n + 1}`
    }

    await updateProject(params.id, {
      [PROJECTS.QUOTATION_NUMBER]: parsed.data.quotationNumber,
      [PROJECTS.QUOTATION_REFERENCE]: nextRef,
    })

    const results = []
    for (const item of parsed.data.items) {
      const projectItem = await createProjectItem({
        projectId: params.id,
        itemName: item.itemName,
        quantity: item.quantity,
      })
      const quotation = await createQuotation({
        projectId: params.id,
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
          const { todoTemplates } = await generateItemTasksForProject(params.id, projectItem.id)
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
