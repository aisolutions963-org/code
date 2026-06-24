// Announcements domain

import { Announcement, AnnouncementCreateInput } from '../types'
import { todayUAE } from '../dateUtils'
import {
  ANNOUNCEMENTS,
  BASE_URL,
  fetchAll,
  fetchWithRetry,
  airtableHeaders,
  recUrl,
  tblUrl,
  RawRecord,
  str,
  bool,
} from './_client'

function transformAnnouncement(record: RawRecord): Announcement {
  const f = record.fields
  return {
    id: record.id,
    title: str(f[ANNOUNCEMENTS.TITLE]) ?? '',
    message: str(f[ANNOUNCEMENTS.MESSAGE]),
    pinned: bool(f[ANNOUNCEMENTS.PINNED]),
    visibleTo: str(f[ANNOUNCEMENTS.VISIBLE_TO]),
    expiresAt: str(f[ANNOUNCEMENTS.EXPIRES_AT]),
  }
}

const ROLE_TO_AUDIENCE: Record<string, string> = {
  installation: 'Installation',
  sed: 'SED',
  fabrication: 'Fabrication',
  manager: 'Manager',
  superadmin: 'Superadmin',
}

export async function getAnnouncements(role?: string): Promise<Announcement[]> {
  const today = todayUAE()
  const expiryFilter = `OR(IS_AFTER({${ANNOUNCEMENTS.EXPIRES_AT}}, "${today}"), {${ANNOUNCEMENTS.EXPIRES_AT}}=BLANK())`

  let visibilityFilter: string
  if (!role || role === 'superadmin') {
    visibilityFilter = `OR({${ANNOUNCEMENTS.VISIBLE_TO}}="Everyone", {${ANNOUNCEMENTS.VISIBLE_TO}}="Superadmin", {${ANNOUNCEMENTS.VISIBLE_TO}}=BLANK())`
  } else {
    const audience = ROLE_TO_AUDIENCE[role]
    visibilityFilter = audience
      ? `OR({${ANNOUNCEMENTS.VISIBLE_TO}}="Everyone", {${ANNOUNCEMENTS.VISIBLE_TO}}=BLANK(), {${ANNOUNCEMENTS.VISIBLE_TO}}="${audience}")`
      : `OR({${ANNOUNCEMENTS.VISIBLE_TO}}="Everyone", {${ANNOUNCEMENTS.VISIBLE_TO}}=BLANK())`
  }

  const formula = `AND(${expiryFilter}, ${visibilityFilter})`
  const records = await fetchAll(ANNOUNCEMENTS.TABLE_ID, {
    filterByFormula: formula,
    sort: [{ field: ANNOUNCEMENTS.PINNED, direction: 'desc' }],
  })
  return records.map(transformAnnouncement)
}

export async function createAnnouncement(input: AnnouncementCreateInput): Promise<Announcement> {
  const fields: Record<string, unknown> = { [ANNOUNCEMENTS.TITLE]: input.title }
  if (input.message) fields[ANNOUNCEMENTS.MESSAGE] = input.message
  if (input.pinned !== undefined) fields[ANNOUNCEMENTS.PINNED] = input.pinned
  if (input.visibleTo) fields[ANNOUNCEMENTS.VISIBLE_TO] = input.visibleTo
  if (input.expiresAt) fields[ANNOUNCEMENTS.EXPIRES_AT] = input.expiresAt

  const res = await fetchWithRetry(tblUrl(ANNOUNCEMENTS.TABLE_ID), {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformAnnouncement(record)
}

export async function updateAnnouncement(
  id: string,
  data: Partial<AnnouncementCreateInput>,
): Promise<Announcement> {
  const fields: Record<string, unknown> = {}
  if (data.title !== undefined) fields[ANNOUNCEMENTS.TITLE] = data.title
  if (data.message !== undefined) fields[ANNOUNCEMENTS.MESSAGE] = data.message
  if (data.pinned !== undefined) fields[ANNOUNCEMENTS.PINNED] = data.pinned
  if (data.visibleTo !== undefined) fields[ANNOUNCEMENTS.VISIBLE_TO] = data.visibleTo
  if (data.expiresAt !== undefined) fields[ANNOUNCEMENTS.EXPIRES_AT] = data.expiresAt

  const res = await fetchWithRetry(recUrl(ANNOUNCEMENTS.TABLE_ID, id), {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
  const record: RawRecord = await res.json()
  return transformAnnouncement(record)
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const res = await fetchWithRetry(`${BASE_URL}/${process.env.AIRTABLE_BASE_ID}/${ANNOUNCEMENTS.TABLE_ID}/${id}`, {
    method: 'DELETE',
    headers: airtableHeaders(),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable error ${res.status}: ${body}`)
  }
}
