import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { PROJECTS, PROJECT_ITEMS } from '@/lib/fieldMap'
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
  const from = new URL(req.url).searchParams.get('from') ?? ''

  const projectParams = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  const activeStages = ['Preparing', 'Open', 'Fabrication', 'Installation']
  const stageFilter = activeStages.map(s => `{${PROJECTS.PROJECT_STAGE}}="${s}"`).join(',')
  projectParams.set('filterByFormula', encodeURIComponent(`OR(${stageFilter})`))
  projectParams.append('fields[]', PROJECTS.PROJECT_ID)
  projectParams.append('fields[]', PROJECTS.PROJECT_NAME)
  projectParams.append('fields[]', PROJECTS.CLIENT_NAME)
  projectParams.append('fields[]', PROJECTS.PROJECT_STAGE)
  projectParams.append('fields[]', PROJECTS.SALES_OWNER)
  projectParams.append('fields[]', PROJECTS.PROJECT_ITEMS)

  const itemParams = new URLSearchParams({ returnFieldsByFieldId: 'true' })
  itemParams.append('fields[]', PROJECT_ITEMS.ITEM_NAME)
  itemParams.append('fields[]', PROJECT_ITEMS.STATUS)
  itemParams.append('fields[]', PROJECT_ITEMS.PROJECT)
  itemParams.append('fields[]', PROJECT_ITEMS.ITEM_TYPE)

  const [projects, items] = await Promise.all([
    fetchAll(PROJECTS.TABLE_ID, projectParams),
    fetchAll(PROJECT_ITEMS.TABLE_ID, itemParams),
  ])

  const itemsByProject = new Map<string, { name: string; status: string }[]>()
  for (const item of items) {
    const f = item.fields
    const projIds = Array.isArray(f[PROJECT_ITEMS.PROJECT]) ? (f[PROJECT_ITEMS.PROJECT] as string[]) : []
    for (const pid of projIds) {
      if (!itemsByProject.has(pid)) itemsByProject.set(pid, [])
      itemsByProject.get(pid)!.push({
        name: (f[PROJECT_ITEMS.ITEM_NAME] as string) ?? '',
        status: (f[PROJECT_ITEMS.STATUS] as string) ?? '',
      })
    }
  }

  // Build flat rows: header row per project + item rows
  const rows: Record<string, unknown>[] = []
  for (const proj of projects) {
    const f = proj.fields
    const rawOwner = f[PROJECTS.SALES_OWNER]
    const owner = (Array.isArray(rawOwner) ? rawOwner[0] : rawOwner) as { name?: string } | undefined
    rows.push({
      type: 'project',
      projectId: (f[PROJECTS.PROJECT_ID] as string) ?? '',
      projectName: (f[PROJECTS.PROJECT_NAME] as string) ?? '',
      client: (f[PROJECTS.CLIENT_NAME] as string) ?? '',
      stage: (f[PROJECTS.PROJECT_STAGE] as string) ?? '',
      sed: owner?.name ?? '',
      itemName: '',
      itemStatus: '',
    })
    const projItems = itemsByProject.get(proj.id) ?? []
    for (const item of projItems) {
      rows.push({
        type: 'item',
        projectId: '',
        projectName: '',
        client: '',
        stage: '',
        sed: '',
        itemName: `  ${item.name}`,
        itemStatus: item.status,
      })
    }
  }

  const buffer = await buildXlsx('Ongoing Projects', [
    { header: 'Project ID', key: 'projectId', width: 14 },
    { header: 'Project Name', key: 'projectName', width: 28 },
    { header: 'Client', key: 'client', width: 22 },
    { header: 'Stage', key: 'stage', width: 16 },
    { header: 'SED', key: 'sed', width: 18 },
    { header: 'Item Name', key: 'itemName', width: 28 },
    { header: 'Item Status', key: 'itemStatus', width: 18 },
  ], rows)

  return xlsxResponse(buffer, 'Ongoing_Projects')
}) as (req: NextRequest) => Promise<NextResponse>
