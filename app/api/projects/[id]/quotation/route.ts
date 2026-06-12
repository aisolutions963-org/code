import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { createProjectItem, createQuotation, generateItemTasksForProject, getProjectById, getQuotationsByProject, updateProject } from '@/lib/airtable'
import { notifyTasksReady } from '@/lib/notifications'
import { CreateQuotationItemsSchema } from '@/lib/validation'
import { PROJECTS } from '@/lib/fieldMap'

export const GET = requireRole('sed', 'manager', 'superadmin')(async (_req, _session, { params }) => {
  const { id } = params
  const quotations = await getQuotationsByProject(id)
  return NextResponse.json({ quotations })
})

export const POST = requireRole('sed', 'manager', 'superadmin')(async (req, session, { params }) => {
  const { id } = params

  let rawBody: unknown
  try {
    rawBody = await req.json()
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

  const projectUpdate: Record<string, unknown> = {
    [PROJECTS.QUOTATION_NUMBER]: parsed.data.quotationNumber,
    [PROJECTS.QUOTATION_REFERENCE]: parsed.data.quotationReference,
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
      recordedBy: session.name,
    })
    results.push({ projectItemId: projectItem.id, quotationId: quotation.id })

    try {
      const { created: tasksCreated, todoTemplates } = await generateItemTasksForProject(id, projectItem.id, item.actions)
      console.log(`[QUOTATION] Item ${projectItem.id} (${item.itemName}): generated ${tasksCreated} tasks, ${todoTemplates.length} To Do`)
      if (todoTemplates.length > 0) {
        await notifyTasksReady(
          todoTemplates.map((t) => ({ taskName: t.taskName, departments: t.department })),
          `New item ready: ${item.itemName}`,
        )
      }
    } catch (err) {
      console.error('[QUOTATION] Item task generation failed for item', projectItem.id, ':', err)
    }
  }

  return NextResponse.json({ created: results.length, items: results }, { status: 201 })
})
