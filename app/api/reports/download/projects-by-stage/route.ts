import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { PROJECTS } from '@/lib/fieldMap'
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

const STAGE_LABELS: Record<string, string> = {
  Preparing:               'Preparing',
  Open:                    'Open',
  Closed:                  'Finished',
  'Not-Approved':          'Not Approved',
  'Closed & Valid Maintenance': 'Maintenance Active',
  'Closed & Warranty Done': 'Maintenance Expired',
}

export const GET = requireRole('superadmin')(async (req: NextRequest) => {
  const url = new URL(req.url)
  const stage = url.searchParams.get('stage') ?? ''
  const unpaid = url.searchParams.get('unpaid') === 'true'

  const params = new URLSearchParams({ returnFieldsByFieldId: 'true' })

  let formula = stage
    ? `{${PROJECTS.PROJECT_STAGE}}="${stage}"`
    : `NOT({${PROJECTS.PROJECT_STAGE}}="")`

  if (unpaid) {
    formula = `AND(${formula}, {${PROJECTS.REMAINING_BALANCE}}>0)`
  }

  params.set('filterByFormula', formula)
  params.append('fields[]', PROJECTS.PROJECT_ID)
  params.append('fields[]', PROJECTS.PROJECT_NAME)
  params.append('fields[]', PROJECTS.CLIENT_NAME)
  params.append('fields[]', PROJECTS.PROJECT_STAGE)
  params.append('fields[]', PROJECTS.SALES_OWNER)
  params.append('fields[]', PROJECTS.QUOTATION_NUMBER)
  params.append('fields[]', PROJECTS.PROJECT_TOTAL_COST)
  params.append('fields[]', PROJECTS.TOTAL_PAID)
  params.append('fields[]', PROJECTS.REMAINING_BALANCE)
  params.append('fields[]', PROJECTS.PROJECT_CREATED_AT)
  params.append('fields[]', PROJECTS.EMIRATE)
  params.append('sort[0][field]', PROJECTS.PROJECT_CREATED_AT)
  params.append('sort[0][direction]', 'desc')

  const projects = await fetchAll(PROJECTS.TABLE_ID, params)

  const rows = projects.map((proj) => {
    const f = proj.fields
    const owner = f[PROJECTS.SALES_OWNER] as { name?: string } | undefined
    return {
      projectId:    (f[PROJECTS.PROJECT_ID] as string) ?? '',
      projectName:  (f[PROJECTS.PROJECT_NAME] as string) ?? '',
      client:       (f[PROJECTS.CLIENT_NAME] as string) ?? '',
      stage:        (f[PROJECTS.PROJECT_STAGE] as string) ?? '',
      sed:          owner?.name ?? '',
      quotation:    (f[PROJECTS.QUOTATION_NUMBER] as string) ?? '',
      emirate:      (f[PROJECTS.EMIRATE] as string) ?? '',
      totalCost:    typeof f[PROJECTS.PROJECT_TOTAL_COST] === 'number' ? f[PROJECTS.PROJECT_TOTAL_COST] as number : 0,
      totalPaid:    typeof f[PROJECTS.TOTAL_PAID] === 'number' ? f[PROJECTS.TOTAL_PAID] as number : 0,
      remaining:    typeof f[PROJECTS.REMAINING_BALANCE] === 'number' ? f[PROJECTS.REMAINING_BALANCE] as number : 0,
      createdAt:    (f[PROJECTS.PROJECT_CREATED_AT] as string) ?? '',
    }
  })

  const stageLabel = stage ? (STAGE_LABELS[stage] ?? stage) : 'All'
  const unpaidSuffix = unpaid ? '_Unpaid' : ''
  const sheetName = `${stageLabel} Projects`.slice(0, 31)
  const filename = `Projects_${stageLabel.replace(/\s+/g, '_')}${unpaidSuffix}`

  const buffer = await buildXlsx(sheetName, [
    { header: 'Project ID',   key: 'projectId',   width: 14 },
    { header: 'Project Name', key: 'projectName', width: 28 },
    { header: 'Client',       key: 'client',      width: 22 },
    { header: 'Stage',        key: 'stage',       width: 18 },
    { header: 'SED',          key: 'sed',         width: 18 },
    { header: 'Quotation No', key: 'quotation',   width: 16 },
    { header: 'Emirate',      key: 'emirate',     width: 14 },
    { header: 'Total Cost',   key: 'totalCost',   width: 14, isCurrency: true },
    { header: 'Total Paid',   key: 'totalPaid',   width: 14, isCurrency: true },
    { header: 'Remaining',    key: 'remaining',   width: 14, isCurrency: true },
    { header: 'Created',      key: 'createdAt',   width: 14, isDate: true },
  ], rows)

  return xlsxResponse(buffer, filename)
}) as (req: NextRequest) => Promise<NextResponse>
