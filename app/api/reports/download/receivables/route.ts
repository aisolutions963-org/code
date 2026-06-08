import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { PAYMENTS, PROJECTS } from '@/lib/fieldMap'
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

  // Receivables = Pending or Overdue payments
  const filterParts = [`OR({${PAYMENTS.PAYMENT_STATUS}}="Pending",{${PAYMENTS.PAYMENT_STATUS}}="Overdue")`]
  if (from) filterParts.push(`IS_AFTER({${PAYMENTS.DUE_DATE}}, "${from}")`)
  if (to)   filterParts.push(`IS_BEFORE({${PAYMENTS.DUE_DATE}}, "${to}")`)
  const formula = filterParts.length > 1 ? `AND(${filterParts.join(',')})` : filterParts[0]

  const payParams = new URLSearchParams({
    returnFieldsByFieldId: 'true',
    filterByFormula: encodeURIComponent(formula),
  })
  payParams.append('fields[]', PAYMENTS.PAYMENT_TYPE)
  payParams.append('fields[]', PAYMENTS.PAYMENT_STATUS)
  payParams.append('fields[]', PAYMENTS.AMOUNT)
  payParams.append('fields[]', PAYMENTS.DUE_DATE)
  payParams.append('fields[]', PAYMENTS.RECEIVED_DATE)
  payParams.append('fields[]', PAYMENTS.REFERENCE_NO)
  payParams.append('fields[]', PAYMENTS.PAYER_NAME)
  payParams.append('fields[]', PAYMENTS.PROJECT)
  payParams.append('fields[]', PAYMENTS.NOTES)

  const projParams = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  projParams.append('fields[]', PROJECTS.PROJECT_ID)
  projParams.append('fields[]', PROJECTS.PROJECT_NAME)
  projParams.append('fields[]', PROJECTS.CLIENT_NAME)

  const [payments, allProjects] = await Promise.all([
    fetchAll(PAYMENTS.TABLE_ID, payParams),
    fetchAll(PROJECTS.TABLE_ID, projParams),
  ])

  const projectById = new Map(allProjects.map((p) => [p.id, p.fields]))

  const today = new Date()

  const rows = payments.map((r) => {
    const f = r.fields
    const projIds = Array.isArray(f[PAYMENTS.PROJECT]) ? (f[PAYMENTS.PROJECT] as string[]) : []
    const proj = projIds[0] ? projectById.get(projIds[0]) : undefined
    const amount = (f[PAYMENTS.AMOUNT] as number) ?? 0
    const dueDate = (f[PAYMENTS.DUE_DATE] as string) ?? ''
    const debtAge = dueDate
      ? Math.floor((today.getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24))
      : 0
    return {
      client: (f[PAYMENTS.PAYER_NAME] as string) ?? (proj?.[PROJECTS.CLIENT_NAME] as string) ?? '',
      project: (proj?.[PROJECTS.PROJECT_NAME] as string) ?? '',
      projectRef: (proj?.[PROJECTS.PROJECT_ID] as string) ?? '',
      amount,
      collected: 0,
      balance: amount,
      dueDate,
      receivedDate: (f[PAYMENTS.RECEIVED_DATE] as string) ?? '',
      debtAge: Math.max(0, debtAge),
      status: (f[PAYMENTS.PAYMENT_STATUS] as string) ?? '',
      notes: (f[PAYMENTS.NOTES] as string) ?? '',
    }
  })

  const buffer = await buildXlsx('Receivables', [
    { header: 'Client / Company', key: 'client', width: 22 },
    { header: 'Project', key: 'project', width: 26 },
    { header: 'Project Ref', key: 'projectRef', width: 14 },
    { header: 'Original (AED)', key: 'amount', width: 16, isCurrency: true },
    { header: 'Collected (AED)', key: 'collected', width: 16, isCurrency: true },
    { header: 'Balance Due (AED)', key: 'balance', width: 18, isCurrency: true },
    { header: 'Due Date', key: 'dueDate', width: 14, isDate: true },
    { header: 'Last Payment Date', key: 'receivedDate', width: 18, isDate: true },
    { header: 'Debt Age (Days)', key: 'debtAge', width: 16 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Notes', key: 'notes', width: 28 },
  ], rows)

  return xlsxResponse(buffer, 'Receivables')
}) as (req: NextRequest) => Promise<NextResponse>
