import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { requireRole } from '@/lib/apiHandler'
import { PROJECTS, PROJECT_ITEMS } from '@/lib/fieldMap'
import { xlsxResponse } from '@/lib/xlsxHelper'
import { formatProjectRef } from '@/lib/reportUtils'
import { projectRefLabel } from '@/lib/projectRef'

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

// singleSelect comes back as a plain string over REST; be defensive about the object form too.
function sel(v: unknown): string {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && 'name' in v) return (v as { name?: string }).name ?? ''
  return ''
}

interface Item {
  name: string
  design: string
  sample: string
  material: string
  submitted: string
  production: string
  deliveryFixing: string
  expectedDelivery: string
  notes: string
  seq: number
}

export const GET = requireRole('superadmin')(async () => {
  const projectParams = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  const activeStages = ['Preparing', 'Open', 'Fabrication', 'Installation']
  const stageFilter = activeStages.map(s => `{${PROJECTS.PROJECT_STAGE}}="${s}"`).join(',')
  // Exclude Trade/Maintenance/Variance sub-projects (they surface under their parent).
  projectParams.set('filterByFormula', `AND(OR(${stageFilter}), {${PROJECTS.REQUEST_TYPE}}="")`)
  projectParams.append('fields[]', PROJECTS.PROJECT_ID)
  projectParams.append('fields[]', PROJECTS.QUOTATION_NUMBER)
  projectParams.append('fields[]', PROJECTS.QUOTATION_REFERENCE)
  projectParams.append('fields[]', PROJECTS.PROJECT_NAME)
  projectParams.append('fields[]', PROJECTS.CLIENT_NAME)
  projectParams.append('fields[]', PROJECTS.PROJECT_STAGE)
  projectParams.append('fields[]', PROJECTS.SALES_OWNER_NAME)

  const itemParams = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  for (const f of [
    PROJECT_ITEMS.ITEM_NAME, PROJECT_ITEMS.PROJECT, PROJECT_ITEMS.ITEM_SEQUENCE,
    PROJECT_ITEMS.DESIGN_STATUS, PROJECT_ITEMS.SAMPLE_STATUS, PROJECT_ITEMS.MATERIAL_STATUS,
    PROJECT_ITEMS.SUBMITTED_TO_PRODUCTION, PROJECT_ITEMS.PRODUCTION_STATUS,
    PROJECT_ITEMS.DELIVERY_FIXING_STATUS, PROJECT_ITEMS.EXPECTED_DELIVERY_DATE, PROJECT_ITEMS.ITEM_NOTES,
  ]) itemParams.append('fields[]', f)

  const [projects, items] = await Promise.all([
    fetchAll(PROJECTS.TABLE_ID, projectParams),
    fetchAll(PROJECT_ITEMS.TABLE_ID, itemParams),
  ])

  const itemsByProject = new Map<string, Item[]>()
  for (const item of items) {
    const f = item.fields
    const projIds = Array.isArray(f[PROJECT_ITEMS.PROJECT]) ? (f[PROJECT_ITEMS.PROJECT] as string[]) : []
    for (const pid of projIds) {
      if (!itemsByProject.has(pid)) itemsByProject.set(pid, [])
      itemsByProject.get(pid)!.push({
        name:             (f[PROJECT_ITEMS.ITEM_NAME] as string) ?? '',
        design:           sel(f[PROJECT_ITEMS.DESIGN_STATUS]),
        sample:           sel(f[PROJECT_ITEMS.SAMPLE_STATUS]),
        material:         sel(f[PROJECT_ITEMS.MATERIAL_STATUS]),
        submitted:        sel(f[PROJECT_ITEMS.SUBMITTED_TO_PRODUCTION]),
        production:       sel(f[PROJECT_ITEMS.PRODUCTION_STATUS]),
        deliveryFixing:   sel(f[PROJECT_ITEMS.DELIVERY_FIXING_STATUS]),
        expectedDelivery: (f[PROJECT_ITEMS.EXPECTED_DELIVERY_DATE] as string) ?? '',
        notes:            (f[PROJECT_ITEMS.ITEM_NOTES] as string) ?? '',
        seq:              (f[PROJECT_ITEMS.ITEM_SEQUENCE] as number) ?? 0,
      })
    }
  }

  // Two-level sheet: a bold project header row (Project ID | Project Name | Client | Stage | SED),
  // then a bold item column-header row, then the project's item rows.
  const PROJECT_HEADERS = ['Project ID', 'Project Name', 'Client', 'Stage', 'SED']
  const ITEM_HEADERS = ['Item Name', 'Design', 'Sample', 'Material', 'Submitted', 'Production', 'Delivery & Fixing', 'Expected Delivery', 'Notes']

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Ongoing Projects')
  ws.columns = [
    { width: 28 }, { width: 16 }, { width: 16 }, { width: 16 },
    { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 30 },
  ]

  const grey = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFDDDDDD' } }
  const lightGrey = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFEEEEEE' } }

  for (const proj of projects) {
    const f = proj.fields
    // Sales Owner is a linked record (returns record-ID strings over REST); the
    // "Name (from Sales Owner)" lookup gives the SED name directly.
    const ownerLookup = f[PROJECTS.SALES_OWNER_NAME]
    const sed = Array.isArray(ownerLookup) ? String(ownerLookup[0] ?? '') : ''

    const projRow = ws.addRow([
      formatProjectRef(projectRefLabel({ quotationNumber: f[PROJECTS.QUOTATION_NUMBER] as string, quotationReference: f[PROJECTS.QUOTATION_REFERENCE] as string, projectId: (f[PROJECTS.PROJECT_ID] as string) ?? '' })),
      (f[PROJECTS.PROJECT_NAME] as string) ?? '',
      (f[PROJECTS.CLIENT_NAME] as string) ?? '',
      (f[PROJECTS.PROJECT_STAGE] as string) ?? '',
      sed,
    ])
    projRow.font = { bold: true }
    projRow.eachCell({ includeEmpty: true }, (c) => { c.fill = grey })
    projRow.commit()

    const hdrRow = ws.addRow(ITEM_HEADERS)
    hdrRow.font = { bold: true, italic: true }
    hdrRow.eachCell({ includeEmpty: true }, (c) => { c.fill = lightGrey })
    hdrRow.commit()

    const projItems = (itemsByProject.get(proj.id) ?? []).sort((a, b) => a.seq - b.seq)
    for (const item of projItems) {
      const row = ws.addRow([
        `  ${item.name}`, item.design, item.sample, item.material, item.submitted,
        item.production, item.deliveryFixing, item.expectedDelivery, item.notes,
      ])
      // Expected Delivery (col 8) formatted as a date when present.
      const dCell = row.getCell(8)
      if (dCell.value) dCell.numFmt = 'DD/MM/YYYY'
      row.commit()
    }
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer)
  return xlsxResponse(buffer, 'Ongoing_Projects')
}) as (req: NextRequest) => Promise<NextResponse>
