import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { PROJECTS } from '@/lib/fieldMap'
import { buildXlsx, xlsxResponse } from '@/lib/xlsxHelper'

export const dynamic = 'force-dynamic'

const BASE_ID = process.env.AIRTABLE_BASE_ID!
const API_KEY = process.env.AIRTABLE_API_KEY!

export const GET = requireRole('superadmin')(async (req: NextRequest) => {
  const from = new URL(req.url).searchParams.get('from') ?? ''

  const params = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  params.append('fields[]', PROJECTS.PROJECT_ID)
  params.append('fields[]', PROJECTS.PROJECT_NAME)
  params.append('fields[]', PROJECTS.CLIENT_NAME)
  params.append('fields[]', PROJECTS.PROJECT_STAGE)
  params.append('fields[]', PROJECTS.SALES_OWNER)
  params.append('fields[]', PROJECTS.PROJECT_TOTAL_COST)
  params.append('fields[]', PROJECTS.PROJECT_CREATED_AT)
  params.append('fields[]', PROJECTS.MANAGER_NOTES)
  if (from) {
    params.set('filterByFormula', encodeURIComponent(`IS_AFTER({${PROJECTS.PROJECT_CREATED_AT}}, "${from}")`))
  }

  const records: { id: string; fields: Record<string, unknown> }[] = []
  let offset: string | undefined
  do {
    const p = new URLSearchParams(params)
    if (offset) p.set('offset', offset)
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${PROJECTS.TABLE_ID}?${p}`,
      { headers: { Authorization: `Bearer ${API_KEY}` }, cache: 'no-store' },
    )
    if (!res.ok) break
    const data = await res.json() as { records: typeof records; offset?: string }
    records.push(...data.records)
    offset = data.offset
  } while (offset)

  // Sort by SED name
  records.sort((a, b) => {
    const oa = a.fields[PROJECTS.SALES_OWNER] as { name?: string } | undefined
    const ob = b.fields[PROJECTS.SALES_OWNER] as { name?: string } | undefined
    return (oa?.name ?? '').localeCompare(ob?.name ?? '')
  })

  const rows = records.map((r) => {
    const f = r.fields
    const owner = f[PROJECTS.SALES_OWNER] as { name?: string } | undefined
    return {
      sedName: owner?.name ?? '',
      projectId: (f[PROJECTS.PROJECT_ID] as string) ?? '',
      projectName: (f[PROJECTS.PROJECT_NAME] as string) ?? '',
      client: (f[PROJECTS.CLIENT_NAME] as string) ?? '',
      stage: (f[PROJECTS.PROJECT_STAGE] as string) ?? '',
      totalCost: (f[PROJECTS.PROJECT_TOTAL_COST] as number) ?? 0,
      createdAt: (f[PROJECTS.PROJECT_CREATED_AT] as string) ?? '',
      notes: (f[PROJECTS.MANAGER_NOTES] as string) ?? '',
    }
  })

  const buffer = await buildXlsx('SED Projects', [
    { header: 'SED Name', key: 'sedName', width: 20 },
    { header: 'Project ID', key: 'projectId', width: 14 },
    { header: 'Project Name', key: 'projectName', width: 28 },
    { header: 'Client', key: 'client', width: 22 },
    { header: 'Stage', key: 'stage', width: 16 },
    { header: 'Total Cost (AED)', key: 'totalCost', width: 18, isCurrency: true },
    { header: 'Created At', key: 'createdAt', width: 14, isDate: true },
    { header: 'Notes', key: 'notes', width: 30 },
  ], rows)

  return xlsxResponse(buffer, 'SED_Projects_Status')
}) as (req: NextRequest) => Promise<NextResponse>
