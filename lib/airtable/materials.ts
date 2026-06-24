// Materials domain

import { Material, MaterialCreateInput, MaterialOrderInput } from '../types'
import {
  MATERIALS_NEEDED,
  fetchAll,
  fetchWithRetry,
  airtableHeaders,
  recUrl,
  tblUrl,
  RawRecord,
  str,
  num,
  strArr,
} from './_client'

function transformMaterial(record: RawRecord): Material {
  const f = record.fields
  return {
    id: record.id,
    name: str(f[MATERIALS_NEEDED.NAME]) ?? '',
    projects: strArr(f[MATERIALS_NEEDED.PROJECTS]),
    supplier: str(f[MATERIALS_NEEDED.SUPPLIER]),
    quantity: num(f[MATERIALS_NEEDED.QUANTITY]),
    unit: str(f[MATERIALS_NEEDED.UNIT]),
    unitCost: num(f[MATERIALS_NEEDED.UNIT_COST]),
    orderStatus: str(f[MATERIALS_NEEDED.ORDER_STATUS]),
    expectedArrivalDate: str(f[MATERIALS_NEEDED.EXPECTED_ARRIVAL_DATE]),
    actualArrivalDate: str(f[MATERIALS_NEEDED.ACTUAL_ARRIVAL_DATE]),
    notes: str(f[MATERIALS_NEEDED.NOTES]),
    purpose: str(f[MATERIALS_NEEDED.PURPOSE]),
    requestedBy: str(f[MATERIALS_NEEDED.REQUESTED_BY]),
    requestDate: str(f[MATERIALS_NEEDED.REQUEST_DATE]),
  }
}

export async function getPendingMaterialsCount(): Promise<number> {
  const formula = `OR({${MATERIALS_NEEDED.ORDER_STATUS}} = "Not ordered", {${MATERIALS_NEEDED.ORDER_STATUS}} = "Pending approval")`
  const records = await fetchAll(MATERIALS_NEEDED.TABLE_ID, {
    filterByFormula: formula,
    fields: [MATERIALS_NEEDED.ORDER_STATUS],
  })
  return records.length
}

export async function getAllActiveMaterials(options?: { projectIds?: string[] }): Promise<Material[]> {
  let formula: string | undefined
  if (options?.projectIds?.length) {
    const projectFilters = options.projectIds
      .map((id) => `{${MATERIALS_NEEDED.PROJECT_RECORD_ID}} = "${id}"`)
      .join(', ')
    formula = `OR(${projectFilters})`
  }
  const records = await fetchAll(MATERIALS_NEEDED.TABLE_ID, formula ? { filterByFormula: formula } : {})
  return records.map(transformMaterial)
}

export async function getMaterialsByProject(projectId: string): Promise<Material[]> {
  const formula = `{${MATERIALS_NEEDED.PROJECT_RECORD_ID}}="${projectId}"`
  const records = await fetchAll(MATERIALS_NEEDED.TABLE_ID, { filterByFormula: formula })
  return records.map(transformMaterial)
}

export async function updateMaterialOrderStatus(
  id: string,
  orderStatus: string,
): Promise<Material> {
  const res = await fetchWithRetry(recUrl(MATERIALS_NEEDED.TABLE_ID, id), {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields: { [MATERIALS_NEEDED.ORDER_STATUS]: orderStatus } }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformMaterial(record)
}

export async function createMaterials(
  projectId: string,
  items: MaterialCreateInput[],
): Promise<Material[]> {
  const created: Material[] = []
  for (let i = 0; i < items.length; i += 10) {
    const chunk = items.slice(i, i + 10)
    const res = await fetchWithRetry(tblUrl(MATERIALS_NEEDED.TABLE_ID), {
      method: 'POST',
      headers: airtableHeaders(),
      body: JSON.stringify({
        records: chunk.map((item) => {
          const fields: Record<string, unknown> = {
            [MATERIALS_NEEDED.NAME]: item.name,
            [MATERIALS_NEEDED.PROJECTS]: [projectId],
            [MATERIALS_NEEDED.PROJECT_RECORD_ID]: projectId,
          }
          if (item.supplier) fields[MATERIALS_NEEDED.SUPPLIER] = item.supplier
          if (item.quantity != null) fields[MATERIALS_NEEDED.QUANTITY] = item.quantity
          if (item.unit) fields[MATERIALS_NEEDED.UNIT] = item.unit
          if (item.unitCost != null) fields[MATERIALS_NEEDED.UNIT_COST] = item.unitCost
          if (item.expectedArrivalDate) fields[MATERIALS_NEEDED.EXPECTED_ARRIVAL_DATE] = item.expectedArrivalDate
          if (item.notes) fields[MATERIALS_NEEDED.NOTES] = item.notes
          return { fields }
        }),
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Airtable error ${res.status}: ${body}`)
    }
    const data = (await res.json()) as { records: RawRecord[] }
    created.push(...data.records.map(transformMaterial))
  }
  return created
}

export async function createMaterialOrder(order: MaterialOrderInput): Promise<Material[]> {
  const created: Material[] = []
  const today = order.requestDate
  for (let i = 0; i < order.items.length; i += 10) {
    const chunk = order.items.slice(i, i + 10)
    const res = await fetchWithRetry(tblUrl(MATERIALS_NEEDED.TABLE_ID), {
      method: 'POST',
      headers: airtableHeaders(),
      body: JSON.stringify({
        records: chunk.map((item) => {
          const fields: Record<string, unknown> = {
            [MATERIALS_NEEDED.NAME]: item.name,
            [MATERIALS_NEEDED.QUANTITY]: item.quantity,
            [MATERIALS_NEEDED.UNIT]: item.unit,
            [MATERIALS_NEEDED.PURPOSE]: order.purpose,
            [MATERIALS_NEEDED.REQUESTED_BY]: order.requestedBy,
            [MATERIALS_NEEDED.REQUEST_DATE]: today,
            [MATERIALS_NEEDED.ORDER_STATUS]: 'Not ordered',
          }
          if (order.projectId) {
            fields[MATERIALS_NEEDED.PROJECTS] = [order.projectId]
            fields[MATERIALS_NEEDED.PROJECT_RECORD_ID] = order.projectId
          }
          if (order.projectItemId) {
            fields[MATERIALS_NEEDED.PROJECT_ITEMS] = [order.projectItemId]
          }
          if (item.supplier) fields[MATERIALS_NEEDED.SUPPLIER] = item.supplier
          if (item.neededByDate) fields[MATERIALS_NEEDED.EXPECTED_ARRIVAL_DATE] = item.neededByDate
          if (item.notes) fields[MATERIALS_NEEDED.NOTES] = item.notes
          return { fields }
        }),
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Airtable error ${res.status}: ${body}`)
    }
    const data = (await res.json()) as { records: RawRecord[] }
    created.push(...data.records.map(transformMaterial))
  }
  return created
}
