import { describe, it, expect, beforeAll } from 'vitest'
import * as fieldMap from '@/lib/fieldMap'
import { STAGE_ORDER } from '@/lib/phases'

/**
 * Airtable schema contract.
 *
 * Unit tests run with dummy credentials and never touch the network, so schema drift in
 * Airtable is invisible to them — it only ever surfaced at runtime (a 422 in production).
 * This suite pins the assumptions the code makes about the base:
 *   1. every field id in lib/fieldMap.ts still exists on its table
 *   2. every single-select the code writes still offers the values the code writes
 *   3. every field the code writes is still writable (not turned into a formula/lookup)
 *
 * Real regressions this would have caught: Maintenance "End Date" becoming a computed
 * field, "Warranty Type" losing the "Standard 1-Year" choice, Maintenance "Status" having
 * no "Pending", and "Project Stage" missing "Closing".
 */

const API_KEY = process.env.AIRTABLE_API_KEY ?? ''
const BASE_ID = process.env.AIRTABLE_BASE_ID ?? ''
// CI/unit dummies must not be mistaken for real credentials.
const hasCreds = !!API_KEY && !!BASE_ID && API_KEY !== 'test' && !/dummy/i.test(API_KEY) && BASE_ID.startsWith('app')

const FIELD_ID = /^fld[A-Za-z0-9]{14}$/
// Field types Airtable computes — writing to any of these is a hard 422.
const COMPUTED_TYPES = new Set([
  'formula', 'rollup', 'count', 'multipleLookupValues', 'autoNumber',
  'createdTime', 'lastModifiedTime', 'createdBy', 'lastModifiedBy', 'button',
])

interface AirtableField { id: string; name: string; type: string; options?: { choices?: { name: string }[] } }
interface AirtableTable { id: string; name: string; fields: AirtableField[] }

let tables = new Map<string, AirtableTable>()

/** fieldMap namespaces keyed by their table id (some use TABLE_ID, some TABLE). */
function namespaces(): Array<{ ns: string; tableId: string; fields: Array<[string, string]> }> {
  const out: Array<{ ns: string; tableId: string; fields: Array<[string, string]> }> = []
  for (const [ns, value] of Object.entries(fieldMap)) {
    if (!value || typeof value !== 'object') continue
    const rec = value as Record<string, unknown>
    const tableId = (rec.TABLE_ID ?? rec.TABLE) as string | undefined
    if (typeof tableId !== 'string' || !tableId.startsWith('tbl')) continue
    const fields = Object.entries(rec)
      .filter(([, v]) => typeof v === 'string' && FIELD_ID.test(v))
      .map(([k, v]) => [k, v as string] as [string, string])
    out.push({ ns, tableId, fields })
  }
  return out
}

function fieldOf(tableId: string, fieldId: string): AirtableField | undefined {
  return tables.get(tableId)?.fields.find((f) => f.id === fieldId)
}

function choicesOf(tableId: string, fieldId: string): string[] {
  return (fieldOf(tableId, fieldId)?.options?.choices ?? []).map((c) => c.name)
}

const d = hasCreds ? describe : describe.skip
if (!hasCreds) {
  console.warn('[schema-contract] AIRTABLE_API_KEY / AIRTABLE_BASE_ID not set — skipping schema contract tests.')
}

d('Airtable schema contract', () => {
  beforeAll(async () => {
    const res = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    })
    if (!res.ok) throw new Error(`Failed to read base schema: ${res.status} ${await res.text()}`)
    const json = (await res.json()) as { tables: AirtableTable[] }
    tables = new Map(json.tables.map((t) => [t.id, t]))
  })

  it('every table referenced by fieldMap exists in the base', () => {
    const missing = namespaces().filter((n) => !tables.has(n.tableId)).map((n) => `${n.ns} → ${n.tableId}`)
    expect(missing, `fieldMap points at tables that no longer exist:\n${missing.join('\n')}`).toEqual([])
  })

  it('every field id in fieldMap exists on its table', () => {
    const missing: string[] = []
    for (const { ns, tableId, fields } of namespaces()) {
      const table = tables.get(tableId)
      if (!table) continue
      for (const [key, id] of fields) {
        if (!table.fields.some((f) => f.id === id)) missing.push(`${ns}.${key} (${id}) not on "${table.name}"`)
      }
    }
    expect(missing, `Stale field ids in lib/fieldMap.ts:\n${missing.join('\n')}`).toEqual([])
  })

  it('Project Stage offers every stage the workflow writes', () => {
    const choices = choicesOf(fieldMap.PROJECTS.TABLE_ID, fieldMap.PROJECTS.PROJECT_STAGE)
    // STAGE_ORDER drives the whole phase flow; Not-Approved is written on reject.
    const required = [...STAGE_ORDER, 'Not-Approved']
    const missing = required.filter((s) => !choices.includes(s))
    expect(missing, `Project Stage is missing choices: ${missing.join(', ')} (has: ${choices.join(', ')})`).toEqual([])
  })

  it('Maintenance Status and Warranty Type offer the values the code writes', () => {
    const status = choicesOf(fieldMap.MAINTENANCE.TABLE_ID, fieldMap.MAINTENANCE.STATUS)
    const missingStatus = ['Active', 'Hold', 'Completed', 'Expired'].filter((s) => !status.includes(s))
    expect(missingStatus, `Maintenance Status missing: ${missingStatus.join(', ')} (has: ${status.join(', ')})`).toEqual([])

    const warranty = choicesOf(fieldMap.MAINTENANCE.TABLE_ID, fieldMap.MAINTENANCE.WARRANTY_TYPE)
    expect(warranty, `Maintenance Warranty Type must offer "1 Year" (has: ${warranty.join(', ')})`).toContain('1 Year')
  })

  it('fields the code writes are still writable (not computed)', () => {
    // Curated: fields written by create/update paths. A computed type here is a guaranteed 422.
    const written: Array<[string, string, string]> = [
      ['MAINTENANCE.PROJECTS', fieldMap.MAINTENANCE.TABLE_ID, fieldMap.MAINTENANCE.PROJECTS],
      ['MAINTENANCE.STATUS', fieldMap.MAINTENANCE.TABLE_ID, fieldMap.MAINTENANCE.STATUS],
      ['MAINTENANCE.START_DATE', fieldMap.MAINTENANCE.TABLE_ID, fieldMap.MAINTENANCE.START_DATE],
      ['MAINTENANCE.WARRANTY_TYPE', fieldMap.MAINTENANCE.TABLE_ID, fieldMap.MAINTENANCE.WARRANTY_TYPE],
      ['PROJECTS.PROJECT_STAGE', fieldMap.PROJECTS.TABLE_ID, fieldMap.PROJECTS.PROJECT_STAGE],
      ['TASKS.STATUS', fieldMap.TASKS.TABLE_ID, fieldMap.TASKS.STATUS],
      ['TASKS.PROJECT', fieldMap.TASKS.TABLE_ID, fieldMap.TASKS.PROJECT],
      ['TASKS.TASK_TEMPLATES_LINK', fieldMap.TASKS.TABLE_ID, fieldMap.TASKS.TASK_TEMPLATES_LINK],
      ['INSTALLATION_LOGS.PROJECT', fieldMap.INSTALLATION_LOGS.TABLE_ID, fieldMap.INSTALLATION_LOGS.PROJECT],
      ['INSTALLATION_LOGS.PROJECT_ITEM', fieldMap.INSTALLATION_LOGS.TABLE_ID, fieldMap.INSTALLATION_LOGS.PROJECT_ITEM],
      ['INSTALLATION_LOGS.DATE', fieldMap.INSTALLATION_LOGS.TABLE_ID, fieldMap.INSTALLATION_LOGS.DATE],
      ['PAYMENTS.PROJECT', fieldMap.PAYMENTS.TABLE_ID, fieldMap.PAYMENTS.PROJECT],
      ['PAYMENTS.AMOUNT', fieldMap.PAYMENTS.TABLE_ID, fieldMap.PAYMENTS.AMOUNT],
    ]
    const computed = written
      .map(([label, tableId, fieldId]) => ({ label, field: fieldOf(tableId, fieldId) }))
      .filter(({ field }) => field && COMPUTED_TYPES.has(field.type))
      .map(({ label, field }) => `${label} is now "${field!.type}" — the code writes it`)
    expect(computed, `Computed fields can't be written:\n${computed.join('\n')}`).toEqual([])
  })
})
