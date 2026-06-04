import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { PURCHASE_ORDERS } from '@/lib/fieldMap'
import { buildXlsx, xlsxResponse } from '@/lib/xlsxHelper'

export const dynamic = 'force-dynamic'

const BASE_ID = process.env.AIRTABLE_BASE_ID!
const API_KEY = process.env.AIRTABLE_API_KEY!

export const GET = requireRole('superadmin')(async (req: NextRequest) => {
  const from = new URL(req.url).searchParams.get('from') ?? ''

  const params = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  params.append('fields[]', PURCHASE_ORDERS.NAME)
  params.append('fields[]', PURCHASE_ORDERS.SUPPLIER)
  params.append('fields[]', PURCHASE_ORDERS.TOTAL_AMOUNT)
  params.append('fields[]', PURCHASE_ORDERS.PO_STATUS)
  params.append('fields[]', PURCHASE_ORDERS.ORDER_DATE)
  params.append('fields[]', PURCHASE_ORDERS.EXPECTED_DELIVERY)
  params.append('fields[]', PURCHASE_ORDERS.NOTES)
  params.append('fields[]', PURCHASE_ORDERS.RECORDED_BY)
  if (from) {
    params.set('filterByFormula', encodeURIComponent(`IS_AFTER({${PURCHASE_ORDERS.ORDER_DATE}}, "${from}")`))
  }

  const records: { id: string; fields: Record<string, unknown> }[] = []
  let offset: string | undefined
  do {
    const p = new URLSearchParams(params)
    if (offset) p.set('offset', offset)
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${PURCHASE_ORDERS.TABLE_ID}?${p}`,
      { headers: { Authorization: `Bearer ${API_KEY}` }, cache: 'no-store' },
    )
    if (!res.ok) break
    const data = await res.json() as { records: typeof records; offset?: string }
    records.push(...data.records)
    offset = data.offset
  } while (offset)

  const rows = records.map((r) => {
    const f = r.fields
    return {
      name: (f[PURCHASE_ORDERS.NAME] as string) ?? '',
      supplier: (f[PURCHASE_ORDERS.SUPPLIER] as string) ?? '',
      total: (f[PURCHASE_ORDERS.TOTAL_AMOUNT] as number) ?? 0,
      status: (f[PURCHASE_ORDERS.PO_STATUS] as string) ?? '',
      orderDate: (f[PURCHASE_ORDERS.ORDER_DATE] as string) ?? '',
      expectedDelivery: (f[PURCHASE_ORDERS.EXPECTED_DELIVERY] as string) ?? '',
      notes: (f[PURCHASE_ORDERS.NOTES] as string) ?? '',
      recordedBy: (f[PURCHASE_ORDERS.RECORDED_BY] as string) ?? '',
    }
  })

  const buffer = await buildXlsx('Payables', [
    { header: 'Payable Name', key: 'name', width: 28 },
    { header: 'Payable To (Supplier)', key: 'supplier', width: 22 },
    { header: 'Total (AED)', key: 'total', width: 16, isCurrency: true },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Order / Invoice Date', key: 'orderDate', width: 18, isDate: true },
    { header: 'Expected Delivery', key: 'expectedDelivery', width: 18, isDate: true },
    { header: 'Notes', key: 'notes', width: 30 },
    { header: 'Recorded By', key: 'recordedBy', width: 18 },
  ], rows)

  return xlsxResponse(buffer, 'Payables')
}) as (req: NextRequest) => Promise<NextResponse>
