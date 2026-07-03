import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { PROJECTS } from '@/lib/fieldMap'
import { buildXlsx, xlsxResponse } from '@/lib/xlsxHelper'

export const dynamic = 'force-dynamic'

const BASE_ID = process.env.AIRTABLE_BASE_ID!
const API_KEY = process.env.AIRTABLE_API_KEY!

type AirtableRecord = { id: string; fields: Record<string, unknown> }

const getOwnerName = (f: Record<string, unknown>): string => {
  const raw = f[PROJECTS.SALES_OWNER]
  const entry = Array.isArray(raw) ? raw[0] : raw
  if (!entry || typeof entry === 'string') return ''
  return (entry as { name?: string }).name ?? ''
}

const getRequestTypeName = (f: Record<string, unknown>): string => {
  const raw = f[PROJECTS.REQUEST_TYPE]
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object') return (raw as { name?: string }).name ?? ''
  return ''
}

const getChildLabel = (child: AirtableRecord): string => {
  const tradeRef = (child.fields[PROJECTS.TRADE_REFERENCE] as string | undefined) ?? ''
  const requestType = getRequestTypeName(child.fields)
  return tradeRef ? `${requestType} (${tradeRef})` : requestType
}

function buildRow(f: Record<string, unknown>, sedName: string, type: string, clientRequests: string) {
  return {
    sedName,
    reference: (f[PROJECTS.PROJECT_ID] as string) ?? '',
    quotationNo: (f[PROJECTS.QUOTATION_NUMBER] as string) ?? '',
    type,
    projectName: (f[PROJECTS.PROJECT_NAME] as string) ?? '',
    client: (f[PROJECTS.CLIENT_NAME] as string) ?? '',
    stage: (f[PROJECTS.PROJECT_STAGE] as string) ?? '',
    totalCost: (f[PROJECTS.PROJECT_TOTAL_COST] as number) ?? 0,
    createdAt: (f[PROJECTS.PROJECT_CREATED_AT] as string) ?? '',
    notes: (f[PROJECTS.MANAGER_NOTES] as string) ?? '',
    clientRequests,
  }
}

export const GET = requireRole('superadmin')(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams
  const from = sp.get('from') ?? ''
  const to   = sp.get('to')   ?? ''

  const params = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  params.append('fields[]', PROJECTS.PROJECT_ID)
  params.append('fields[]', PROJECTS.PROJECT_NAME)
  params.append('fields[]', PROJECTS.CLIENT_NAME)
  params.append('fields[]', PROJECTS.PROJECT_STAGE)
  params.append('fields[]', PROJECTS.SALES_OWNER)
  params.append('fields[]', PROJECTS.PROJECT_TOTAL_COST)
  params.append('fields[]', PROJECTS.PROJECT_CREATED_AT)
  params.append('fields[]', PROJECTS.MANAGER_NOTES)
  params.append('fields[]', PROJECTS.QUOTATION_NUMBER)
  params.append('fields[]', PROJECTS.REQUEST_TYPE)
  params.append('fields[]', PROJECTS.PARENT_PROJECT)
  params.append('fields[]', PROJECTS.TRADE_REFERENCE)

  const dateParts: string[] = []
  if (from) dateParts.push(`IS_AFTER({${PROJECTS.PROJECT_CREATED_AT}}, "${from}")`)
  if (to)   dateParts.push(`IS_BEFORE({${PROJECTS.PROJECT_CREATED_AT}}, "${to}")`)
  if (dateParts.length === 1) params.set('filterByFormula', dateParts[0])
  if (dateParts.length === 2) params.set('filterByFormula', `AND(${dateParts.join(',')})`)

  const records: AirtableRecord[] = []
  let offset: string | undefined
  do {
    const p = new URLSearchParams(params)
    if (offset) p.set('offset', offset)
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${PROJECTS.TABLE_ID}?${p}`,
      { headers: { Authorization: `Bearer ${API_KEY}` }, cache: 'no-store' },
    )
    if (!res.ok) break
    const data = await res.json() as { records: AirtableRecord[]; offset?: string }
    records.push(...data.records)
    offset = data.offset
  } while (offset)

  // Build parent/child maps
  const parentMap = new Map<string, AirtableRecord>()
  const children = new Map<string, AirtableRecord[]>()

  for (const r of records) {
    const requestType = r.fields[PROJECTS.REQUEST_TYPE] as string | undefined
    if (!requestType) {
      parentMap.set(r.id, r)
      if (!children.has(r.id)) children.set(r.id, [])
    }
  }

  for (const r of records) {
    const requestType = r.fields[PROJECTS.REQUEST_TYPE] as string | undefined
    if (requestType) {
      const parentArr = r.fields[PROJECTS.PARENT_PROJECT]
      const parentId = Array.isArray(parentArr) ? (parentArr[0] as string) : undefined
      if (parentId && children.has(parentId)) {
        children.get(parentId)!.push(r)
      } else {
        parentMap.set(r.id, r)
        children.set(r.id, [])
      }
    }
  }

  // Sort parents by SED name, then emit parent row followed by children
  const sortedParents = Array.from(parentMap.values())
    .sort((a, b) => getOwnerName(a.fields).localeCompare(getOwnerName(b.fields)))

  const rows: ReturnType<typeof buildRow>[] = []
  for (const parent of sortedParents) {
    const sedName = getOwnerName(parent.fields)
    const childRecords = children.get(parent.id) ?? []
    const clientRequests = childRecords.map(getChildLabel).join(', ')
    rows.push(buildRow(parent.fields, sedName, '', clientRequests))
    for (const child of childRecords) {
      rows.push(buildRow(child.fields, sedName, getChildLabel(child), ''))
    }
  }

  const buffer = await buildXlsx('SED Projects', [
    { header: 'SED Name',         key: 'sedName',      width: 20 },
    { header: 'Reference',        key: 'reference',    width: 14 },
    { header: 'Quotation No.',    key: 'quotationNo',  width: 18 },
    { header: 'Type',             key: 'type',         width: 14 },
    { header: 'Project Name',     key: 'projectName',  width: 28 },
    { header: 'Client',           key: 'client',       width: 22 },
    { header: 'Stage',            key: 'stage',        width: 16 },
    { header: 'Total Cost (AED)', key: 'totalCost',    width: 18, isCurrency: true },
    { header: 'Created At',       key: 'createdAt',    width: 14, isDate: true },
    { header: 'Notes',            key: 'notes',        width: 30 },
    { header: 'Client Requests',  key: 'clientRequests', width: 28 },
  ], rows)

  return xlsxResponse(buffer, 'SED_Projects_Status')
}) as (req: NextRequest) => Promise<NextResponse>
