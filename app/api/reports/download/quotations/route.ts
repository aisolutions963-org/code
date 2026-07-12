import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { QUOTATIONS, PROJECTS, FOLLOW_UP_LOG } from '@/lib/fieldMap'
import { buildXlsx, xlsxResponse } from '@/lib/xlsxHelper'

export const dynamic = 'force-dynamic'

const BASE_ID = process.env.AIRTABLE_BASE_ID!
const API_KEY = process.env.AIRTABLE_API_KEY!
const VAT_RATE = 0.05 // UAE standard — computed here until F5 persists explicit VAT

interface Rec { id: string; createdTime: string; fields: Record<string, unknown> }

async function fetchAll(tableId: string, params: URLSearchParams): Promise<Rec[]> {
  const records: Rec[] = []
  let offset: string | undefined
  do {
    const p = new URLSearchParams(params)
    if (offset) p.set('offset', offset)
    const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}?${p}`, {
      headers: { Authorization: `Bearer ${API_KEY}` }, cache: 'no-store',
    })
    if (!res.ok) break
    const data = (await res.json()) as { records: Rec[]; offset?: string }
    records.push(...data.records)
    offset = data.offset
  } while (offset)
  return records
}

function num(v: unknown): number { return typeof v === 'number' ? v : 0 }
function str(v: unknown): string { return typeof v === 'string' ? v : '' }
function collab(v: unknown): string {
  if (!v || typeof v !== 'object') return ''
  return (v as { name?: string }).name ?? ''
}
function firstLink(v: unknown): string | undefined {
  return Array.isArray(v) && v[0] ? ((v[0] as { id?: string }).id ?? (v[0] as string)) : undefined
}

export const GET = requireRole('superadmin')(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams
  const from = sp.get('from') ?? ''
  const to = sp.get('to') ?? ''

  const quotesParams = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  for (const f of [
    QUOTATIONS.NAME, QUOTATIONS.PROJECT, QUOTATIONS.CLIENT_NAME, QUOTATIONS.QUANTITY,
    QUOTATIONS.UNIT_PRICE, QUOTATIONS.QUOTATION_STATUS, QUOTATIONS.QUOTE_NUMBER,
    QUOTATIONS.REVISION, QUOTATIONS.QUOTE_DATE, QUOTATIONS.SENT_DATE, QUOTATIONS.SALES,
    QUOTATIONS.VARIATION_1, QUOTATIONS.VARIATION_2, QUOTATIONS.NOTES,
  ]) quotesParams.append('fields[]', f)

  const projParams = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  for (const f of [
    PROJECTS.PROJECT_ID, PROJECTS.PROJECT_NAME, PROJECTS.NICKNAME, PROJECTS.CLIENT_NAME,
    PROJECTS.PROJECT_STAGE, PROJECTS.PROJECT_DESCRIPTION, PROJECTS.QUOTATION_NUMBER,
    PROJECTS.QUOTATION_REFERENCE, PROJECTS.SALES_OWNER_NAME,
  ]) projParams.append('fields[]', f)

  const fuParams = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  for (const f of [FOLLOW_UP_LOG.QUOTATION, FOLLOW_UP_LOG.DATE, FOLLOW_UP_LOG.NEXT_DATE])
    fuParams.append('fields[]', f)

  const [quotes, projects, followUps] = await Promise.all([
    fetchAll(QUOTATIONS.TABLE_ID, quotesParams),
    fetchAll(PROJECTS.TABLE_ID, projParams),
    fetchAll(FOLLOW_UP_LOG.TABLE, fuParams),
  ])

  const projById = new Map(projects.map((p) => [p.id, p.fields]))

  // Follow-ups → per-project last/next date (mapped quotation → project).
  const quoteToProject = new Map(quotes.map((q) => [q.id, firstLink(q.fields[QUOTATIONS.PROJECT])]))
  const lastFollowByProject = new Map<string, string>()
  const nextFollowByProject = new Map<string, string>()
  for (const fu of followUps) {
    const quoteId = firstLink(fu.fields[FOLLOW_UP_LOG.QUOTATION])
    const projId = quoteId ? quoteToProject.get(quoteId) : undefined
    if (!projId) continue
    const date = str(fu.fields[FOLLOW_UP_LOG.DATE])
    const next = str(fu.fields[FOLLOW_UP_LOG.NEXT_DATE])
    if (date && date > (lastFollowByProject.get(projId) ?? '')) lastFollowByProject.set(projId, date)
    if (next && next > (nextFollowByProject.get(projId) ?? '')) nextFollowByProject.set(projId, next)
  }

  // Date window applied on record createdTime (Quote/Sent dates are not populated).
  const inWindow = (c: string) => (!from || c >= from) && (!to || c <= `${to}T23:59:59.999Z`)

  // Group quotation item-lines by project.
  interface Group { projId?: string; quoteNumber: string; revision: string; quoteDate: string; clientName: string; status: string; sales: string; amount: number; var1: number; var2: number; notes: string }
  const groups = new Map<string, Group>()
  for (const q of quotes) {
    if (!inWindow(q.createdTime)) continue
    const f = q.fields
    const projId = firstLink(f[QUOTATIONS.PROJECT]) ?? `__noproj_${q.id}`
    let g = groups.get(projId)
    if (!g) {
      g = { projId: firstLink(f[QUOTATIONS.PROJECT]), quoteNumber: '', revision: '', quoteDate: '', clientName: '', status: '', sales: '', amount: 0, var1: 0, var2: 0, notes: '' }
      groups.set(projId, g)
    }
    g.amount += num(f[QUOTATIONS.QUANTITY]) * num(f[QUOTATIONS.UNIT_PRICE])
    g.var1 += num(f[QUOTATIONS.VARIATION_1])
    g.var2 += num(f[QUOTATIONS.VARIATION_2])
    g.quoteNumber ||= str(f[QUOTATIONS.QUOTE_NUMBER])
    g.revision ||= str(f[QUOTATIONS.REVISION])
    // Sent Date is populated by F5; the extended Quote Date field is not.
    g.quoteDate ||= str(f[QUOTATIONS.SENT_DATE]) || str(f[QUOTATIONS.QUOTE_DATE])
    g.clientName ||= str(f[QUOTATIONS.CLIENT_NAME])
    g.status ||= str(f[QUOTATIONS.QUOTATION_STATUS])
    g.sales ||= collab(f[QUOTATIONS.SALES])
    g.notes ||= str(f[QUOTATIONS.NOTES])
  }

  const firstLookup = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? '') : '')

  const rows = Array.from(groups.values()).map((g) => {
    const proj = g.projId ? projById.get(g.projId) : undefined
    const vat = g.amount * VAT_RATE
    const totalWithVat = g.amount + vat
    return {
      // Quote Number / Sales live on the Project (set at Make-Quotation / F5); the
      // quote-level fields are unpopulated. Prefer the project value, fall back to quote.
      quoteNumber:   str(proj?.[PROJECTS.QUOTATION_NUMBER]) || g.quoteNumber,
      revision:      g.revision,
      quoteDate:     g.quoteDate,
      clientName:    g.clientName || str(proj?.[PROJECTS.CLIENT_NAME]),
      projectDetails: str(proj?.[PROJECTS.PROJECT_NAME]) || str(proj?.[PROJECTS.NICKNAME]) || str(proj?.[PROJECTS.PROJECT_DESCRIPTION]),
      status:        g.status,
      projectStatus: str(proj?.[PROJECTS.PROJECT_STAGE]),
      sales:         g.sales || firstLookup(proj?.[PROJECTS.SALES_OWNER_NAME]),
      quoteAmount:   g.amount,
      vat,
      totalWithVat,
      variation1:    g.var1,
      variation2:    g.var2,
      totalWithVars: totalWithVat + g.var1 + g.var2,
      lastFollowUp:  g.projId ? (lastFollowByProject.get(g.projId) ?? '') : '',
      nextFollowUp:  g.projId ? (nextFollowByProject.get(g.projId) ?? '') : '',
      notes:         g.notes,
    }
  })

  const buffer = await buildXlsx('Quotations', [
    { header: 'Quote Number',                 key: 'quoteNumber',    width: 16 },
    { header: 'Revision',                      key: 'revision',       width: 10 },
    { header: 'Quote Date',                    key: 'quoteDate',      width: 14, isDate: true },
    { header: 'Client Name',                   key: 'clientName',     width: 22 },
    { header: 'Project Details',               key: 'projectDetails', width: 30 },
    { header: 'Q. Status',                     key: 'status',         width: 16 },
    { header: 'Project Status',                key: 'projectStatus',  width: 16 },
    { header: 'Sales',                         key: 'sales',          width: 18 },
    { header: 'Quote Amount (AED)',            key: 'quoteAmount',    width: 18, isCurrency: true },
    { header: 'VAT (AED)',                     key: 'vat',            width: 14, isCurrency: true },
    { header: 'Total incl. VAT (AED)',         key: 'totalWithVat',   width: 20, isCurrency: true },
    { header: 'Variation 1 (AED)',             key: 'variation1',     width: 16, isCurrency: true },
    { header: 'Variation 2 (AED)',             key: 'variation2',     width: 16, isCurrency: true },
    { header: 'Total with Variations (AED)',   key: 'totalWithVars',  width: 22, isCurrency: true },
    { header: 'Last Follow-Up',                key: 'lastFollowUp',   width: 16, isDate: true },
    { header: 'Next Follow-Up',                key: 'nextFollowUp',   width: 16, isDate: true },
    { header: 'Notes',                         key: 'notes',          width: 30 },
  ], rows)

  return xlsxResponse(buffer, 'Quotations_Pipeline')
}) as (req: NextRequest) => Promise<NextResponse>
