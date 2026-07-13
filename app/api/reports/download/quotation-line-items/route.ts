import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { QUOTATION_LINE_ITEMS, QUOTATIONS } from '@/lib/fieldMap'
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
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`)
    const data = await res.json() as { records: typeof records; offset?: string }
    records.push(...data.records)
    offset = data.offset
  } while (offset)
  return records
}

function selectName(v: unknown): string {
  if (!v) return ''
  if (typeof v === 'object' && v !== null && 'name' in v) return (v as { name: string }).name
  return ''
}

export const GET = requireRole('superadmin')(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams
  const from = sp.get('from') ?? ''
  const to   = sp.get('to')   ?? ''

  const liParams = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  liParams.append('fields[]', QUOTATION_LINE_ITEMS.QUOTATION)
  liParams.append('fields[]', QUOTATION_LINE_ITEMS.LINE_NO)
  liParams.append('fields[]', QUOTATION_LINE_ITEMS.DESCRIPTION)
  liParams.append('fields[]', QUOTATION_LINE_ITEMS.QTY)
  liParams.append('fields[]', QUOTATION_LINE_ITEMS.UNIT)
  liParams.append('fields[]', QUOTATION_LINE_ITEMS.RATE)
  liParams.append('fields[]', QUOTATION_LINE_ITEMS.VAT_PERCENT)
  liParams.append('fields[]', QUOTATION_LINE_ITEMS.LINE_SUBTOTAL)
  liParams.append('fields[]', QUOTATION_LINE_ITEMS.VAT_AMOUNT)
  liParams.append('fields[]', QUOTATION_LINE_ITEMS.LINE_TOTAL)

  const quotParams = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  quotParams.append('fields[]', QUOTATIONS.NAME)
  quotParams.append('fields[]', QUOTATIONS.QUOTE_NUMBER)
  quotParams.append('fields[]', QUOTATIONS.CLIENT_NAME)
  quotParams.append('fields[]', QUOTATIONS.SENT_DATE)

  if (from || to) {
    const dateParts: string[] = []
    if (from) dateParts.push(`IS_AFTER({${QUOTATIONS.SENT_DATE}}, "${from}")`)
    if (to)   dateParts.push(`IS_BEFORE({${QUOTATIONS.SENT_DATE}}, "${to}")`)
    const formula = dateParts.length === 2 ? `AND(${dateParts.join(',')})` : dateParts[0]
    quotParams.set('filterByFormula', formula)
  }

  const [lineItems, allQuotations] = await Promise.all([
    fetchAll(QUOTATION_LINE_ITEMS.TABLE_ID, liParams),
    fetchAll(QUOTATIONS.TABLE_ID, quotParams),
  ])

  const quotationById = new Map(allQuotations.map((q) => [q.id, q.fields]))

  // If date filter applied, only keep line items linked to matching quotations
  const validQuotIds = from || to ? new Set(allQuotations.map((q) => q.id)) : null

  const rows = lineItems
    .filter((li) => {
      if (!validQuotIds) return true
      const ids = Array.isArray(li.fields[QUOTATION_LINE_ITEMS.QUOTATION])
        ? (li.fields[QUOTATION_LINE_ITEMS.QUOTATION] as string[])
        : []
      return ids.some((id) => validQuotIds.has(id))
    })
    .map((li) => {
      const f = li.fields
      const quotIds = Array.isArray(f[QUOTATION_LINE_ITEMS.QUOTATION])
        ? (f[QUOTATION_LINE_ITEMS.QUOTATION] as string[])
        : []
      const quot = quotIds[0] ? quotationById.get(quotIds[0]) : undefined
      // Quote Number (extended field); fall back to the record name when unset.
      const quoteNumber = (quot?.[QUOTATIONS.QUOTE_NUMBER] as string)
        || (quot?.[QUOTATIONS.NAME] as string)
        || ''

      return {
        quoteNumber,
        client:      (quot?.[QUOTATIONS.CLIENT_NAME] as string) ?? '',
        lineNo:      (f[QUOTATION_LINE_ITEMS.LINE_NO] as number) ?? 0,
        description: (f[QUOTATION_LINE_ITEMS.DESCRIPTION] as string) ?? '',
        qty:         (f[QUOTATION_LINE_ITEMS.QTY] as number) ?? 0,
        unit:        selectName(f[QUOTATION_LINE_ITEMS.UNIT]),
        rate:        (f[QUOTATION_LINE_ITEMS.RATE] as number) ?? 0,
        vatPct:      (f[QUOTATION_LINE_ITEMS.VAT_PERCENT] as number) ?? 0,
        subtotal:    (f[QUOTATION_LINE_ITEMS.LINE_SUBTOTAL] as number) ?? 0,
        vatAmount:   (f[QUOTATION_LINE_ITEMS.VAT_AMOUNT] as number) ?? 0,
        lineTotal:   (f[QUOTATION_LINE_ITEMS.LINE_TOTAL] as number) ?? 0,
      }
    })
    .sort((a, b) => a.quoteNumber.localeCompare(b.quoteNumber) || a.lineNo - b.lineNo)

  const buffer = await buildXlsx('Line Items', [
    { header: 'Quote Number',      key: 'quoteNumber', width: 16 },
    { header: 'Client Name',       key: 'client',      width: 22 },
    { header: 'Line #',            key: 'lineNo',      width: 8 },
    { header: 'Description',       key: 'description', width: 32 },
    { header: 'Qty',               key: 'qty',         width: 8 },
    { header: 'Unit',              key: 'unit',        width: 10 },
    { header: 'Rate (AED)',        key: 'rate',        width: 14, isCurrency: true },
    { header: 'VAT %',             key: 'vatPct',      width: 8 },
    { header: 'Subtotal (AED)',    key: 'subtotal',    width: 16, isCurrency: true },
    { header: 'VAT (AED)',         key: 'vatAmount',   width: 16, isCurrency: true },
    { header: 'Line Total (AED)',  key: 'lineTotal',   width: 16, isCurrency: true },
  ], rows)

  return xlsxResponse(buffer, 'Quotation_Line_Items')
}) as (req: NextRequest) => Promise<NextResponse>
