import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PROJECTS, PROJECT_ITEMS, INSTALLATION_LOGS, TEAM_MEMBERS } from '@/lib/fieldMap'
import {
  getProjectById,
  getProjectItemsForProject,
  createProjectItem,
  createInstallationLog,
  getInstallationLogsByProject,
} from '@/lib/airtable'

/**
 * Airtable integration tests.
 *
 * These exercise the behaviours that unit tests structurally cannot: how Airtable
 * actually shapes responses (linked records come back as record-id strings, ARRAYJOIN
 * returns primary-field names) and whether our read filters really scope correctly.
 * Every bug they cover shipped to production at least once:
 *   - installation-day logs vanishing (filter matched names, not record ids)
 *   - logs shared across items (no per-item scoping)
 *   - linked-record fields parsed as objects instead of id strings
 *
 * The suite seeds its own records and deletes them in afterAll, so it needs no
 * pre-existing fixtures and leaves nothing behind. Records are name-prefixed with
 * INTEGRATION_PREFIX so any orphan is obvious.
 */

const API_KEY = process.env.AIRTABLE_API_KEY ?? ''
const BASE_ID = process.env.AIRTABLE_BASE_ID ?? ''
const hasCreds =
  !!API_KEY && !!BASE_ID && API_KEY !== 'test' && !/dummy/i.test(API_KEY) && BASE_ID.startsWith('app')
// Opt-in only: this suite WRITES to the base, so it must never run by accident.
const optedIn = process.env.RUN_INTEGRATION === '1'
const enabled = hasCreds && optedIn

const INTEGRATION_PREFIX = 'ZZ-INTEGRATION-TEST'
const stamp = `${INTEGRATION_PREFIX} ${new Date().toISOString()}`

/** Record ids created by this run, deleted in afterAll (LIFO). */
const trash: Array<{ table: string; id: string }> = []

async function airtable(path: string, init?: RequestInit) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`Airtable ${init?.method ?? 'GET'} ${path} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function createProjectRecord(fields: Record<string, unknown>): Promise<string> {
  const json = (await airtable(PROJECTS.TABLE_ID, {
    method: 'POST',
    body: JSON.stringify({ fields, typecast: true }),
  })) as { id: string }
  trash.push({ table: PROJECTS.TABLE_ID, id: json.id })
  return json.id
}

async function firstTeamMemberId(): Promise<string | undefined> {
  const json = (await airtable(`${TEAM_MEMBERS.TABLE_ID}?maxRecords=1`)) as { records: { id: string }[] }
  return json.records[0]?.id
}

const d = enabled ? describe : describe.skip
if (!enabled) {
  const why = !hasCreds ? 'AIRTABLE_API_KEY / AIRTABLE_BASE_ID not set' : 'RUN_INTEGRATION=1 not set'
  console.warn(`[integration] skipping — ${why}.`)
}

d('Airtable integration (seeded)', () => {
  let projectId: string
  let itemA: string
  let itemB: string
  let memberId: string | undefined

  beforeAll(async () => {
    memberId = await firstTeamMemberId()
    projectId = await createProjectRecord({
      [PROJECTS.PROJECT_NAME]: `${stamp} project`,
      [PROJECTS.PROJECT_STAGE]: 'Preparing',
      // Linked-record fields: we write ids and expect ids back (not {id,name} objects).
      ...(memberId ? { [PROJECTS.SALES_OWNER]: [memberId], [PROJECTS.COMMUN_SEDS]: [memberId] } : {}),
    })

    const a = await createProjectItem({ projectId, itemName: `${stamp} item A`, quantity: 1 })
    const b = await createProjectItem({ projectId, itemName: `${stamp} item B`, quantity: 1 })
    itemA = a.id
    itemB = b.id
    trash.push({ table: PROJECT_ITEMS.TABLE_ID, id: itemA }, { table: PROJECT_ITEMS.TABLE_ID, id: itemB })

    const logA = await createInstallationLog({
      project: [projectId], projectItem: [itemA], date: '2099-01-01', workDescription: `${stamp} day A`,
    })
    const logB = await createInstallationLog({
      project: [projectId], projectItem: [itemB], date: '2099-01-02', workDescription: `${stamp} day B`,
    })
    trash.push({ table: INSTALLATION_LOGS.TABLE_ID, id: logA.id }, { table: INSTALLATION_LOGS.TABLE_ID, id: logB.id })
  })

  afterAll(async () => {
    // Delete newest-first; never let a cleanup failure mask a test result.
    for (const { table, id } of [...trash].reverse()) {
      await airtable(`${table}/${id}`, { method: 'DELETE' }).catch((err) =>
        console.error(`[integration] cleanup failed for ${table}/${id}:`, err),
      )
    }
  })

  it('project items are found via the linked-project filter', async () => {
    const items = await getProjectItemsForProject(projectId)
    expect(items.map((i) => i.id).sort()).toEqual([itemA, itemB].sort())
  })

  it('linked-record fields come back as record-id strings, not objects', async () => {
    const project = await getProjectById(projectId)
    if (!memberId) return
    // salesOwner is parsed via firstLinkedRecord — .id must be the Team Member record id.
    expect(project.salesOwner?.id).toBe(memberId)
    // communSedIds drives the SED workload count in the New Project form.
    expect(project.communSedIds ?? []).toContain(memberId)
  })

  it('installation logs are returned for the project (regression: logs vanished)', async () => {
    const logs = await getInstallationLogsByProject(projectId)
    expect(logs.length).toBe(2)
  })

  it('installation logs are scoped per item (regression: items shared one list)', async () => {
    const forA = await getInstallationLogsByProject(projectId, itemA)
    const forB = await getInstallationLogsByProject(projectId, itemB)

    expect(forA.map((l) => l.workDescription)).toEqual([`${stamp} day A`])
    expect(forB.map((l) => l.workDescription)).toEqual([`${stamp} day B`])
    // The decisive assertion: one item's day must never surface under the other.
    expect(forA.some((l) => l.projectItem?.includes(itemB))).toBe(false)
    expect(forB.some((l) => l.projectItem?.includes(itemA))).toBe(false)
  })
})
