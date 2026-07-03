// Resolves which projects a SED user is authorized to see, combining the Airtable
// SALES_OWNER/COMMUN_SEDS match with the SQLite sed_projects mapping table (see
// ARCHITECTURE.md "SED project visibility"). Centralised here so every route that
// needs to gate a specific project by SED ownership uses the same rule.
import { SessionPayload } from './types'
import { getUserById, getSedProjectIdsByUserId } from './db'
import { getSedProjectIds } from './airtable'

export async function resolveSedProjectIds(session: SessionPayload): Promise<string[]> {
  const [dbUser, sqliteIds] = await Promise.all([
    getUserById(session.id),
    getSedProjectIdsByUserId(session.id),
  ])
  const airtableIds = await getSedProjectIds({
    sedAirtableMemberId: dbUser?.airtable_member_id ?? undefined,
    sedEmail: session.email,
  })
  return [...new Set([...airtableIds, ...sqliteIds])]
}

export async function isSedAuthorizedForProject(
  session: SessionPayload,
  projectId: string,
): Promise<boolean> {
  const projectIds = await resolveSedProjectIds(session)
  return projectIds.includes(projectId)
}
