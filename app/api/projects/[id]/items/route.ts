import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getProjectItemsForProject, getQuotationsByProject } from '@/lib/airtable'
import { Quotation } from '@/lib/types'
import { isSedAuthorizedForProject } from '@/lib/sedAccess'

export const GET = requireRole()(
  async (_req: NextRequest, session, { params }) => {
    if (session.role === 'sed' && !(await isSedAuthorizedForProject(session, params.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
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
