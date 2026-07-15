import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { PROJECTS, QUOTATIONS } from '@/lib/fieldMap'
import { buildXlsx, xlsxResponse } from '@/lib/xlsxHelper'
import { formatProjectRef } from '@/lib/reportUtils'

export const dynamic = 'force-dynamic'

const BASE_ID = process.env.AIRTABLE_BASE_ID!
const API_KEY = process.env.AIRTABLE_API_KEY!
const VAT_RATE = 0.05 // computed here until F5 persists explicit VAT/amounts

type AirtableRecord = { id: string; fields: Record<string, unknown> }

async function fetchAll(tableId: string, params: URLSearchParams): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = []
  let offset: string | undefined
  do {
    const p = new URLSearchParams(params)
    if (offset) p.set('offset', offset)
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${tableId}?${p}`,
      { headers: { Authorization: `Bearer ${API_KEY}` }, cache: 'no-store' },
    )
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`)
    const data = await res.json() as { records: AirtableRecord[]; offset?: string }
    records.push(...data.records)
    offset = data.offset
  } while (offset)
  return records
}

const num = (v: unknown): number => (typeof v === 'number' ? v : 0)
const firstLink = (v: unknown): string | undefined =>
  Array.isArray(v) && v[0] ? ((v[0] as { id?: string }).id ?? (v[0] as string)) : undefined

const getOwnerName = (f: Record<string, unknown>): string => {
  // Sales Owner links return record-ID strings over REST; use the name lookup instead.
  const lookup = f[PROJECTS.SALES_OWNER_NAME]
  return Array.isArray(lookup) ? String(lookup[0] ?? '') : ''
}

export const GET = requireRole('superadmin')(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams
  const from = sp.get('from') ?? ''
  const to   = sp.get('to')   ?? ''

  const params = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  for (const f of [
    PROJECTS.PROJECT_ID, PROJECTS.PROJECT_NAME, PROJECTS.CLIENT_NAME, PROJECTS.PROJECT_STAGE,
    PROJECTS.SALES_OWNER_NAME, PROJECTS.PRODUCTION_START_DATE, PROJECTS.MANAGER_NOTES, PROJECTS.PROJECT_CREATED_AT,
  ]) params.append('fields[]', f)

  const dateParts: string[] = []
  if (from) dateParts.push(`IS_AFTER({${PROJECTS.PROJECT_CREATED_AT}}, "${from}")`)
  if (to)   dateParts.push(`IS_BEFORE({${PROJECTS.PROJECT_CREATED_AT}}, "${to}")`)
  if (dateParts.length === 1) params.set('filterByFormula', dateParts[0])
  if (dateParts.length === 2) params.set('filterByFormula', `AND(${dateParts.join(',')})`)

  const quoteParams = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  for (const f of [QUOTATIONS.PROJECT, QUOTATIONS.QUANTITY, QUOTATIONS.UNIT_PRICE, QUOTATIONS.VARIATION_1, QUOTATIONS.VARIATION_2])
    quoteParams.append('fields[]', f)

  const [projects, quotes] = await Promise.all([
    fetchAll(PROJECTS.TABLE_ID, params),
    fetchAll(QUOTATIONS.TABLE_ID, quoteParams),
  ])

  // Sum quotation item-lines per project → amount / variations.
  const amountByProject = new Map<string, { amount: number; var1: number; var2: number }>()
  for (const q of quotes) {
    const projId = firstLink(q.fields[QUOTATIONS.PROJECT])
    if (!projId) continue
    const acc = amountByProject.get(projId) ?? { amount: 0, var1: 0, var2: 0 }
    acc.amount += num(q.fields[QUOTATIONS.QUANTITY]) * num(q.fields[QUOTATIONS.UNIT_PRICE])
    acc.var1 += num(q.fields[QUOTATIONS.VARIATION_1])
    acc.var2 += num(q.fields[QUOTATIONS.VARIATION_2])
    amountByProject.set(projId, acc)
  }

  const rows = projects
    .sort((a, b) => getOwnerName(a.fields).localeCompare(getOwnerName(b.fields))
      || String(a.fields[PROJECTS.PROJECT_ID] ?? '').localeCompare(String(b.fields[PROJECTS.PROJECT_ID] ?? '')))
    .map((proj) => {
      const f = proj.fields
      const amt = amountByProject.get(proj.id) ?? { amount: 0, var1: 0, var2: 0 }
      const totalWithVars = amt.amount + amt.amount * VAT_RATE + amt.var1 + amt.var2
      return {
        sedName:        getOwnerName(f),
        projectId:      formatProjectRef((f[PROJECTS.PROJECT_ID] as string) ?? ''),
        projectName:    (f[PROJECTS.PROJECT_NAME] as string) ?? '',
        client:         (f[PROJECTS.CLIENT_NAME] as string) ?? '',
        stage:          (f[PROJECTS.PROJECT_STAGE] as string) ?? '',
        quoteAmount:    amt.amount,
        variation1:     amt.var1,
        variation2:     amt.var2,
        totalWithVars,
        productionStart:(f[PROJECTS.PRODUCTION_START_DATE] as string) ?? '',
        notes:          (f[PROJECTS.MANAGER_NOTES] as string) ?? '',
      }
    })

  const buffer = await buildXlsx('SED Projects', [
    { header: 'SED Name',                    key: 'sedName',         width: 20 },
    { header: 'Project ID',                  key: 'projectId',       width: 14 },
    { header: 'Project Name',                key: 'projectName',     width: 28 },
    { header: 'Client',                      key: 'client',          width: 22 },
    { header: 'Stage',                       key: 'stage',           width: 16 },
    { header: 'Quote Amount (AED)',          key: 'quoteAmount',     width: 18, isCurrency: true },
    { header: 'Variation 1 (AED)',           key: 'variation1',      width: 16, isCurrency: true },
    { header: 'Variation 2 (AED)',           key: 'variation2',      width: 16, isCurrency: true },
    { header: 'Total with Variations (AED)', key: 'totalWithVars',   width: 22, isCurrency: true },
    { header: 'Production Start Date',       key: 'productionStart', width: 18, isDate: true },
    { header: 'Notes',                       key: 'notes',           width: 30 },
  ], rows)

  return xlsxResponse(buffer, 'SED_Projects_Status')
}) as (req: NextRequest) => Promise<NextResponse>
