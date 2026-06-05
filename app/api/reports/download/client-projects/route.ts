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

function str(v: unknown): string { return typeof v === 'string' ? v : '' }
function num(v: unknown): number { return typeof v === 'number' ? v : 0 }

export const GET = requireRole('superadmin')(async (req: NextRequest) => {
  const clientName = new URL(req.url).searchParams.get('clientName') ?? ''
  if (!clientName) {
    return NextResponse.json({ error: 'clientName is required' }, { status: 400 })
  }

  const safe = clientName.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const params = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  params.set('filterByFormula', `LOWER({${PROJECTS.CLIENT_NAME}}) = LOWER("${safe}")`)
  params.append('fields[]', PROJECTS.PROJECT_ID)
  params.append('fields[]', PROJECTS.PROJECT_NAME)
  params.append('fields[]', PROJECTS.PROJECT_STAGE)
  params.append('fields[]', PROJECTS.CLIENT_NAME)
  params.append('fields[]', PROJECTS.QUOTATION_NUMBER)
  params.append('fields[]', PROJECTS.PAYMENT_MODE)
  params.append('fields[]', PROJECTS.PROJECT_TOTAL_COST)
  params.append('fields[]', PROJECTS.TOTAL_PAID)
  params.append('fields[]', PROJECTS.REMAINING_BALANCE)
  params.append('fields[]', PROJECTS.EMIRATE)
  params.append('fields[]', PROJECTS.LOCATION)
  params.append('fields[]', PROJECTS.DETAILED_LOCATION)
  params.append('fields[]', PROJECTS.SALES_OWNER)
  params.append('fields[]', PROJECTS.PROJECT_CREATED_AT)
  params.set('sort[0][field]', PROJECTS.PROJECT_CREATED_AT)
  params.set('sort[0][direction]', 'desc')

  const records = await fetchAll(PROJECTS.TABLE_ID, params)

  const rows = records.map((r) => {
    const f = r.fields
    const rawOwner = f[PROJECTS.SALES_OWNER]
    const owner = Array.isArray(rawOwner) && rawOwner.length > 0 && typeof rawOwner[0] !== 'string'
      ? (rawOwner[0] as { name?: string }).name ?? ''
      : ''
    const location = [str(f[PROJECTS.EMIRATE]), str(f[PROJECTS.LOCATION]), str(f[PROJECTS.DETAILED_LOCATION])]
      .filter(Boolean).join(' — ')
    const totalCost = num(f[PROJECTS.PROJECT_TOTAL_COST])
    const totalPaid = num(f[PROJECTS.TOTAL_PAID])
    const remaining = num(f[PROJECTS.REMAINING_BALANCE]) || (totalCost - totalPaid)
    return {
      projectId:    str(f[PROJECTS.PROJECT_ID]),
      projectName:  str(f[PROJECTS.PROJECT_NAME]),
      stage:        str(f[PROJECTS.PROJECT_STAGE]),
      quotation:    str(f[PROJECTS.QUOTATION_NUMBER]),
      paymentMode:  str(f[PROJECTS.PAYMENT_MODE]),
      totalCost,
      totalPaid,
      remaining,
      location,
      sed:          owner,
      createdAt:    str(f[PROJECTS.PROJECT_CREATED_AT]).slice(0, 10),
    }
  })

  const safeFilename = clientName.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_')
  const buffer = await buildXlsx(`${clientName.slice(0, 25)} — Projects`, [
    { header: 'Project ID',    key: 'projectId',   width: 14 },
    { header: 'Project Name',  key: 'projectName', width: 30 },
    { header: 'Stage',         key: 'stage',       width: 18 },
    { header: 'Quotation No.', key: 'quotation',   width: 16 },
    { header: 'Payment Mode',  key: 'paymentMode', width: 14 },
    { header: 'Total Cost (AED)',  key: 'totalCost',  width: 16, isCurrency: true },
    { header: 'Paid (AED)',    key: 'totalPaid',   width: 14, isCurrency: true },
    { header: 'Remaining (AED)', key: 'remaining', width: 16, isCurrency: true },
    { header: 'Location',      key: 'location',    width: 30 },
    { header: 'SED',           key: 'sed',         width: 20 },
    { header: 'Created',       key: 'createdAt',   width: 12, isDate: true },
  ], rows)

  return xlsxResponse(buffer, `Client_${safeFilename}`)
}) as (req: NextRequest) => Promise<NextResponse>
