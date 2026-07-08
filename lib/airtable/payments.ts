// Payments domain

import { Payment, PaymentCreateInput, PaymentUpdateInput } from '../types'
import {
  PAYMENTS,
  fetchAll,
  fetchWithRetry,
  airtableHeaders,
  recUrl,
  tblUrl,
  RawRecord,
  transformPayment,
  deleteByProject,
} from './_client'

export async function getPaymentsByProjectIds(projectIds: string[]): Promise<Payment[]> {
  const idSet = new Set(projectIds)
  const records = await fetchAll(PAYMENTS.TABLE_ID, {
    sort: [{ field: PAYMENTS.RECEIVED_DATE, direction: 'desc' }],
  })
  return records
    .filter((r) => {
      const proj = r.fields[PAYMENTS.PROJECT]
      return Array.isArray(proj) && (proj as string[]).some((id) => idSet.has(id))
    })
    .map(transformPayment)
}

export async function getPaymentsByProject(projectId: string): Promise<Payment[]> {
  return getPaymentsByProjectIds([projectId])
}

export async function getAllPayments(): Promise<Payment[]> {
  const records = await fetchAll(PAYMENTS.TABLE_ID, {
    sort: [{ field: PAYMENTS.RECEIVED_DATE, direction: 'desc' }],
  })
  return records.map(transformPayment)
}

export async function createPayment(input: PaymentCreateInput): Promise<Payment> {
  const fields: Record<string, unknown> = {
    [PAYMENTS.PROJECT]: input.project,
    [PAYMENTS.AMOUNT]: input.amount,
    [PAYMENTS.PAYMENT_TYPE]: input.paymentType,
    [PAYMENTS.PAYMENT_STATUS]: input.paymentStatus,
    [PAYMENTS.PAYMENT_METHOD]: input.paymentMethod,
  }
  if (input.referenceNo) fields[PAYMENTS.REFERENCE_NO] = input.referenceNo
  if (input.receivedDate) fields[PAYMENTS.RECEIVED_DATE] = input.receivedDate
  if (input.dueDate) fields[PAYMENTS.DUE_DATE] = input.dueDate
  if (input.stageAtPayment) fields[PAYMENTS.STAGE_AT_PAYMENT] = input.stageAtPayment
  if (input.payerType) fields[PAYMENTS.PAYER_TYPE] = input.payerType
  if (input.payerName) fields[PAYMENTS.PAYER_NAME] = input.payerName
  if (input.commissionAmount != null) fields[PAYMENTS.COMMISSION_AMOUNT] = input.commissionAmount
  if (input.name) fields[PAYMENTS.NAME] = input.name
  if (input.notes) fields[PAYMENTS.NOTES] = input.notes
  if (input.recordedBy) fields[PAYMENTS.RECORDED_BY] = input.recordedBy

  const res = await fetchWithRetry(tblUrl(PAYMENTS.TABLE_ID), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformPayment(record)
}

export async function updatePayment(id: string, input: PaymentUpdateInput): Promise<Payment> {
  const fields: Record<string, unknown> = {}
  if (input.amount !== undefined) fields[PAYMENTS.AMOUNT] = input.amount
  if (input.paymentType !== undefined) fields[PAYMENTS.PAYMENT_TYPE] = input.paymentType
  if (input.paymentStatus !== undefined) fields[PAYMENTS.PAYMENT_STATUS] = input.paymentStatus
  if (input.paymentMethod !== undefined) fields[PAYMENTS.PAYMENT_METHOD] = input.paymentMethod
  if (input.referenceNo !== undefined) fields[PAYMENTS.REFERENCE_NO] = input.referenceNo
  if (input.receivedDate !== undefined) fields[PAYMENTS.RECEIVED_DATE] = input.receivedDate
  if (input.dueDate !== undefined) fields[PAYMENTS.DUE_DATE] = input.dueDate
  if (input.payerType !== undefined) fields[PAYMENTS.PAYER_TYPE] = input.payerType
  if (input.payerName !== undefined) fields[PAYMENTS.PAYER_NAME] = input.payerName
  if (input.commissionAmount !== undefined) fields[PAYMENTS.COMMISSION_AMOUNT] = input.commissionAmount
  if (input.notes !== undefined) fields[PAYMENTS.NOTES] = input.notes
  const res = await fetchWithRetry(recUrl(PAYMENTS.TABLE_ID, id), {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformPayment(record)
}

export async function deletePaymentsByProject(projectId: string): Promise<number> {
  return deleteByProject(PAYMENTS.TABLE_ID, PAYMENTS.PROJECT, projectId)
}

export async function getSedQuarterlyRevenue(
  projectIds: string[],
  quarterStart: string,
  quarterEnd: string,
): Promise<number> {
  if (projectIds.length === 0) return 0

  // Airtable linked-record fields in formulas resolve to primary field values (names),
  // not record IDs — so project-ID filtering must happen client-side.
  const projectIdSet = new Set(projectIds)
  const formula = `AND({${PAYMENTS.PAYMENT_STATUS}}="Received", {${PAYMENTS.RECEIVED_DATE}}>="${quarterStart}", {${PAYMENTS.RECEIVED_DATE}}<="${quarterEnd}")`
  const records = await fetchAll(PAYMENTS.TABLE_ID, {
    filterByFormula: formula,
    fields: [PAYMENTS.AMOUNT, PAYMENTS.PROJECT],
  })

  return records
    .filter((r) => {
      const proj = r.fields[PAYMENTS.PROJECT]
      return Array.isArray(proj) && (proj as string[]).some((id) => projectIdSet.has(id))
    })
    .reduce((s, r) => s + ((r.fields[PAYMENTS.AMOUNT] as number) || 0), 0)
}

// Same quarter revenue, broken down per project (for the commission-card breakdown).
export async function getSedQuarterlyRevenueByProject(
  projectIds: string[],
  quarterStart: string,
  quarterEnd: string,
): Promise<Record<string, number>> {
  if (projectIds.length === 0) return {}
  const projectIdSet = new Set(projectIds)
  const formula = `AND({${PAYMENTS.PAYMENT_STATUS}}="Received", {${PAYMENTS.RECEIVED_DATE}}>="${quarterStart}", {${PAYMENTS.RECEIVED_DATE}}<="${quarterEnd}")`
  const records = await fetchAll(PAYMENTS.TABLE_ID, {
    filterByFormula: formula,
    fields: [PAYMENTS.AMOUNT, PAYMENTS.PROJECT],
  })
  const byProject: Record<string, number> = {}
  for (const r of records) {
    const proj = r.fields[PAYMENTS.PROJECT]
    if (!Array.isArray(proj)) continue
    const firstMatch = (proj as string[]).find((id) => projectIdSet.has(id))
    if (firstMatch) byProject[firstMatch] = (byProject[firstMatch] ?? 0) + ((r.fields[PAYMENTS.AMOUNT] as number) || 0)
  }
  return byProject
}
