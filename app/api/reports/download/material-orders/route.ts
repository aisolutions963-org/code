import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { MATERIALS_NEEDED, PROJECTS } from '@/lib/fieldMap'
import { buildXlsx, xlsxResponse } from '@/lib/xlsxHelper'

export const dynamic = 'force-dynamic'

const BASE_ID = process.env.AIRTABLE_BASE_ID!
const API_KEY = process.env.AIRTABLE_API_KEY!

async function fetchAll(tableId: string, params: URLSearchParams) {
  const records: { id: string; fields: Record<string, unknown> }[] = []
  let offset: string | undefined
  do {
    const p = new URLSearchParams(params)
    if (offset) p.set('offset', offset)
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${tableId}?${p}`,
      { headers: { Authorization: `Bearer ${API_KEY}` }, cache: 'no-store' },
    )
    if (!res.ok) break
    const data = await res.json() as { records: typeof records; offset?: string }
    records.push(...data.records)
    offset = data.offset
  } while (offset)
  return records
}

export const GET = requireRole('superadmin')(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams
  const from = sp.get('from') ?? ''
  const to   = sp.get('to')   ?? ''

  const matParams = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  const dateParts: string[] = []
  if (from) dateParts.push(`IS_AFTER({${MATERIALS_NEEDED.REQUEST_DATE}}, "${from}")`)
  if (to)   dateParts.push(`IS_BEFORE({${MATERIALS_NEEDED.REQUEST_DATE}}, "${to}")`)
  if (dateParts.length === 1) matParams.set('filterByFormula', encodeURIComponent(dateParts[0]))
  if (dateParts.length === 2) matParams.set('filterByFormula', encodeURIComponent(`AND(${dateParts.join(',')})`))

  matParams.append('fields[]', MATERIALS_NEEDED.NAME)
  matParams.append('fields[]', MATERIALS_NEEDED.SUPPLIER)
  matParams.append('fields[]', MATERIALS_NEEDED.QUANTITY)
  matParams.append('fields[]', MATERIALS_NEEDED.UNIT)
  matParams.append('fields[]', MATERIALS_NEEDED.UNIT_COST)
  matParams.append('fields[]', MATERIALS_NEEDED.ORDER_STATUS)
  matParams.append('fields[]', MATERIALS_NEEDED.REQUEST_DATE)
  matParams.append('fields[]', MATERIALS_NEEDED.EXPECTED_ARRIVAL_DATE)
  matParams.append('fields[]', MATERIALS_NEEDED.ACTUAL_ARRIVAL_DATE)
  matParams.append('fields[]', MATERIALS_NEEDED.PROJECTS)
  matParams.append('fields[]', MATERIALS_NEEDED.NOTES)

  const projParams = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  projParams.append('fields[]', PROJECTS.PROJECT_ID)
  projParams.append('fields[]', PROJECTS.PROJECT_NAME)

  const [materials, allProjects] = await Promise.all([
    fetchAll(MATERIALS_NEEDED.TABLE_ID, matParams),
    fetchAll(PROJECTS.TABLE_ID, projParams),
  ])

  const projectById = new Map(allProjects.map((p) => [p.id, p.fields]))

  const rows = materials.map((r) => {
    const f = r.fields
    const projIds = Array.isArray(f[MATERIALS_NEEDED.PROJECTS]) ? (f[MATERIALS_NEEDED.PROJECTS] as string[]) : []
    const proj = projIds[0] ? projectById.get(projIds[0]) : undefined
    const qty = (f[MATERIALS_NEEDED.QUANTITY] as number) ?? 0
    const unitCost = (f[MATERIALS_NEEDED.UNIT_COST] as number) ?? 0
    return {
      name: (f[MATERIALS_NEEDED.NAME] as string) ?? '',
      supplier: (f[MATERIALS_NEEDED.SUPPLIER] as string) ?? '',
      qty,
      unit: (f[MATERIALS_NEEDED.UNIT] as string) ?? '',
      project: (proj?.[PROJECTS.PROJECT_NAME] as string) ?? '',
      status: (f[MATERIALS_NEEDED.ORDER_STATUS] as string) ?? '',
      reqDate: (f[MATERIALS_NEEDED.REQUEST_DATE] as string) ?? '',
      expectedArrival: (f[MATERIALS_NEEDED.EXPECTED_ARRIVAL_DATE] as string) ?? '',
      actualArrival: (f[MATERIALS_NEEDED.ACTUAL_ARRIVAL_DATE] as string) ?? '',
      total: qty * unitCost,
      notes: (f[MATERIALS_NEEDED.NOTES] as string) ?? '',
    }
  })

  const buffer = await buildXlsx('Material Orders', [
    { header: 'Material Name', key: 'name', width: 28 },
    { header: 'Supplier', key: 'supplier', width: 22 },
    { header: 'Qty', key: 'qty', width: 8 },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Project', key: 'project', width: 26 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Req. Date', key: 'reqDate', width: 14, isDate: true },
    { header: 'Expected Arrival', key: 'expectedArrival', width: 16, isDate: true },
    { header: 'Actual Arrival', key: 'actualArrival', width: 14, isDate: true },
    { header: 'Total (AED)', key: 'total', width: 14, isCurrency: true },
    { header: 'Notes', key: 'notes', width: 28 },
  ], rows)

  return xlsxResponse(buffer, 'Material_Orders')
}) as (req: NextRequest) => Promise<NextResponse>
