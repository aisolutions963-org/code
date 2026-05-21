import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getProjectItemsForProject, getQuotationsByProject } from '@/lib/airtable'
import { Quotation } from '@/lib/types'

export const GET = requireRole()(
  async (_req: NextRequest, _session, { params }) => {
    const [items, quotations] = await Promise.all([
      getProjectItemsForProject(params.id),
      getQuotationsByProject(params.id),
    ])

    const quotationByItem: Record<string, Quotation> = {}
    for (const q of quotations) {
      const itemId = q.projectItem?.[0]
      if (itemId && !quotationByItem[itemId]) quotationByItem[itemId] = q
    }

    const result = items.map((item) => ({
      ...item,
      quotation: quotationByItem[item.id] ?? null,
    }))

    return NextResponse.json({ items: result })
  },
)
