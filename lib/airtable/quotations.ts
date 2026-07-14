// Quotations and Project Items domain

import { Quotation, ProjectItem, PurchaseOrder, PurchaseOrderCreateInput, InstallationLog, InstallationLogCreateInput } from '../types'
import {
  QUOTATIONS,
  PROJECT_ITEMS,
  PURCHASE_ORDERS,
  INSTALLATION_LOGS,
  fetchAll,
  fetchWithRetry,
  airtableHeaders,
  recUrl,
  tblUrl,
  RawRecord,
  str,
  num,
  bool,
  strArr,
  deleteByProject,
} from './_client'

// ─── Project Items ────────────────────────────────────────────────────────────

function transformProjectItem(record: RawRecord): ProjectItem {
  const f = record.fields
  return {
    id: record.id,
    itemName: str(f[PROJECT_ITEMS.ITEM_NAME]) ?? '',
    itemId: str(f[PROJECT_ITEMS.ITEM_ID]) ?? '',
    project: strArr(f[PROJECT_ITEMS.PROJECT]),
    status: str(f[PROJECT_ITEMS.STATUS]),
    quantity: num(f[PROJECT_ITEMS.QUANTITY]),
    itemCreatedAt: str(f[PROJECT_ITEMS.ITEM_CREATED_AT]),
  }
}

export async function createProjectItem(input: {
  projectId: string
  itemName: string
  quantity: number
}): Promise<ProjectItem> {
  const fields: Record<string, unknown> = {
    [PROJECT_ITEMS.ITEM_NAME]: input.itemName,
    [PROJECT_ITEMS.PROJECT]: [input.projectId],
    [PROJECT_ITEMS.QUANTITY]: input.quantity,
  }
  const res = await fetchWithRetry(tblUrl(PROJECT_ITEMS.TABLE_ID), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformProjectItem(record)
}

export async function getProjectItemsForProject(projectId: string): Promise<ProjectItem[]> {
  const records = await fetchAll(PROJECT_ITEMS.TABLE_ID, {
    sort: [{ field: PROJECT_ITEMS.ITEM_SEQUENCE, direction: 'asc' }],
  })
  return records
    .filter((r) => strArr(r.fields[PROJECT_ITEMS.PROJECT]).includes(projectId))
    .map(transformProjectItem)
}

// ─── Quotations ───────────────────────────────────────────────────────────────

function transformQuotation(record: RawRecord): Quotation {
  const f = record.fields
  return {
    id: record.id,
    name: str(f[QUOTATIONS.NAME]) ?? '',
    project: strArr(f[QUOTATIONS.PROJECT]),
    projectItem: strArr(f[QUOTATIONS.PROJECT_ITEM]),
    description: str(f[QUOTATIONS.DESCRIPTION]),
    quantity: num(f[QUOTATIONS.QUANTITY]),
    unitPrice: num(f[QUOTATIONS.UNIT_PRICE]),
    quotationStatus: str(f[QUOTATIONS.QUOTATION_STATUS]),
    notes: str(f[QUOTATIONS.NOTES]),
    sentDate: str(f[QUOTATIONS.SENT_DATE]),
    approvedDate: str(f[QUOTATIONS.APPROVED_DATE]),
    recordedBy: str(f[QUOTATIONS.RECORDED_BY]),
  }
}

export async function createQuotation(input: {
  projectId: string
  projectItemId: string
  itemName: string
  quantity: number
  unitPrice: number
  description?: string
  notes?: string
  quotationDate?: string
  recordedBy?: string
}): Promise<Quotation> {
  const fields: Record<string, unknown> = {
    [QUOTATIONS.NAME]: input.itemName,
    [QUOTATIONS.PROJECT]: [input.projectId],
    [QUOTATIONS.PROJECT_ITEM]: [input.projectItemId],
    [QUOTATIONS.QUANTITY]: input.quantity,
    [QUOTATIONS.UNIT_PRICE]: input.unitPrice,
  }
  if (input.description) fields[QUOTATIONS.DESCRIPTION] = input.description
  if (input.notes) fields[QUOTATIONS.NOTES] = input.notes
  if (input.quotationDate) fields[QUOTATIONS.SENT_DATE] = input.quotationDate
  if (input.recordedBy) fields[QUOTATIONS.RECORDED_BY] = input.recordedBy

  const res = await fetchWithRetry(tblUrl(QUOTATIONS.TABLE_ID), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformQuotation(record)
}

export async function getQuotationsByProject(projectId: string): Promise<Quotation[]> {
  const records = await fetchAll(QUOTATIONS.TABLE_ID, {})
  return records
    .filter((r) => strArr(r.fields[QUOTATIONS.PROJECT]).includes(projectId))
    .map(transformQuotation)
}

export async function deleteQuotationsByProject(projectId: string): Promise<number> {
  return deleteByProject(QUOTATIONS.TABLE_ID, QUOTATIONS.PROJECT, projectId)
}

// ─── Purchase Orders ─────────────────────────────────────────────────────────

function transformPurchaseOrder(record: RawRecord): PurchaseOrder {
  const f = record.fields
  return {
    id: record.id,
    name: str(f[PURCHASE_ORDERS.NAME]) ?? '',
    project: strArr(f[PURCHASE_ORDERS.PROJECT]),
    supplier: str(f[PURCHASE_ORDERS.SUPPLIER]),
    totalAmount: num(f[PURCHASE_ORDERS.TOTAL_AMOUNT]),
    poStatus: str(f[PURCHASE_ORDERS.PO_STATUS]),
    orderDate: str(f[PURCHASE_ORDERS.ORDER_DATE]),
    expectedDelivery: str(f[PURCHASE_ORDERS.EXPECTED_DELIVERY]),
    actualDelivery: str(f[PURCHASE_ORDERS.ACTUAL_DELIVERY]),
    managerApproved: bool(f[PURCHASE_ORDERS.MANAGER_APPROVED]),
    notes: str(f[PURCHASE_ORDERS.NOTES]),
    recordedBy: str(f[PURCHASE_ORDERS.RECORDED_BY]),
  }
}

export async function getPurchaseOrdersByProject(projectId: string): Promise<PurchaseOrder[]> {
  const formula = `FIND("${projectId}", ARRAYJOIN({${PURCHASE_ORDERS.PROJECT}}, ","))`
  const records = await fetchAll(PURCHASE_ORDERS.TABLE_ID, {
    filterByFormula: formula,
    sort: [{ field: PURCHASE_ORDERS.ORDER_DATE, direction: 'desc' }],
  })
  return records.map(transformPurchaseOrder)
}

export async function createPurchaseOrder(input: PurchaseOrderCreateInput): Promise<PurchaseOrder> {
  const fields: Record<string, unknown> = {
    [PURCHASE_ORDERS.PROJECT]: input.project,
    [PURCHASE_ORDERS.SUPPLIER]: input.supplier,
    [PURCHASE_ORDERS.PO_STATUS]: 'Draft',
  }
  if (input.totalAmount != null) fields[PURCHASE_ORDERS.TOTAL_AMOUNT] = input.totalAmount
  if (input.orderDate) fields[PURCHASE_ORDERS.ORDER_DATE] = input.orderDate
  if (input.expectedDelivery) fields[PURCHASE_ORDERS.EXPECTED_DELIVERY] = input.expectedDelivery
  if (input.notes) fields[PURCHASE_ORDERS.NOTES] = input.notes
  if (input.recordedBy) fields[PURCHASE_ORDERS.RECORDED_BY] = input.recordedBy
  const res = await fetchWithRetry(tblUrl(PURCHASE_ORDERS.TABLE_ID), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformPurchaseOrder(record)
}

// ─── Installation Logs ────────────────────────────────────────────────────────

function transformInstallationLog(record: RawRecord): InstallationLog {
  const f = record.fields
  return {
    id: record.id,
    name: str(f[INSTALLATION_LOGS.NAME]) ?? '',
    project: strArr(f[INSTALLATION_LOGS.PROJECT]),
    projectItem: strArr(f[INSTALLATION_LOGS.PROJECT_ITEM]),
    date: str(f[INSTALLATION_LOGS.DATE]) ?? '',
    installationTeam: str(f[INSTALLATION_LOGS.INSTALLATION_TEAM]),
    numberOfLaborers: num(f[INSTALLATION_LOGS.NUMBER_OF_LABORERS]),
    workDescription: str(f[INSTALLATION_LOGS.WORK_DESCRIPTION]),
    expectedFinishDate: str(f[INSTALLATION_LOGS.EXPECTED_FINISH_DATE]),
    recordedBy: str(f[INSTALLATION_LOGS.RECORDED_BY]),
  }
}

export async function getInstallationLogsByProject(
  projectId: string,
  itemId?: string,
): Promise<InstallationLog[]> {
  // Filter by the linked project's record ID in memory: ARRAYJOIN on a linked-record field
  // yields the project's PRIMARY field (its name), not its record ID, so a FIND("rec…")
  // formula never matches — which made every fetch come back empty (logs "disappeared").
  const records = await fetchAll(INSTALLATION_LOGS.TABLE_ID, {
    sort: [{ field: INSTALLATION_LOGS.DATE, direction: 'desc' }],
  })
  return records
    .filter((r) => strArr(r.fields[INSTALLATION_LOGS.PROJECT]).includes(projectId))
    // The Installation Day task is per-item; when an item is given, scope the days to it so a
    // day logged on one item doesn't surface under the project's other items.
    .filter((r) => !itemId || strArr(r.fields[INSTALLATION_LOGS.PROJECT_ITEM]).includes(itemId))
    .map(transformInstallationLog)
}

export async function createInstallationLog(input: InstallationLogCreateInput): Promise<InstallationLog> {
  const fields: Record<string, unknown> = {
    [INSTALLATION_LOGS.PROJECT]: input.project,
    [INSTALLATION_LOGS.DATE]: input.date,
  }
  if (input.projectItem?.length) fields[INSTALLATION_LOGS.PROJECT_ITEM] = input.projectItem
  if (input.installationTeam) fields[INSTALLATION_LOGS.INSTALLATION_TEAM] = input.installationTeam
  if (input.numberOfLaborers != null) fields[INSTALLATION_LOGS.NUMBER_OF_LABORERS] = input.numberOfLaborers
  if (input.workDescription) fields[INSTALLATION_LOGS.WORK_DESCRIPTION] = input.workDescription
  if (input.expectedFinishDate) fields[INSTALLATION_LOGS.EXPECTED_FINISH_DATE] = input.expectedFinishDate
  if (input.recordedBy) fields[INSTALLATION_LOGS.RECORDED_BY] = input.recordedBy
  const res = await fetchWithRetry(tblUrl(INSTALLATION_LOGS.TABLE_ID), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformInstallationLog(record)
}
