import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import {
  getMaintenanceRecords,
  getProjectNamesByIds,
  expireMaintenanceRecord,
  expireOverdueMaintenanceRecords,
  updateProject,
} from '@/lib/airtable'
import { PROJECTS } from '@/lib/fieldMap'

export const GET = requireRole('superadmin', 'manager', 'installation')(async () => {
  // Auto-expire warranties past their 1-year end date (also runs daily via cron)
  await expireOverdueMaintenanceRecords()
  const records = await getMaintenanceRecords()
  return buildResponse(records)
})

async function buildResponse(records: Awaited<ReturnType<typeof getMaintenanceRecords>>) {
  const sorted = [...records].sort(
    (a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime(),
  )

  const allProjectIds = Array.from(new Set(sorted.flatMap((r) => r.projects ?? [])))
  const projectNames = allProjectIds.length > 0 ? await getProjectNamesByIds(allProjectIds) : {}

  const enriched = sorted.map((r) => ({
    ...r,
    daysRemaining: Math.ceil(
      (new Date(r.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    ),
    projectNames: (r.projects ?? []).map((id) => projectNames[id] ?? id),
  }))

  return NextResponse.json({ records: enriched })
}

// PATCH /api/maintenance — manually expire a single maintenance record
export const PATCH = requireRole('superadmin')(async (req: NextRequest) => {
  let body: { recordId: string }
  try {
    body = await req.json() as { recordId: string }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const { recordId } = body
  if (!recordId) return NextResponse.json({ error: 'recordId required' }, { status: 400 })

  const records = await getMaintenanceRecords()
  const record = records.find((r) => r.id === recordId)
  if (!record) return NextResponse.json({ error: 'Record not found' }, { status: 404 })

  await expireMaintenanceRecord(recordId)
  await Promise.all(
    (record.projects ?? []).map((pid) =>
      updateProject(pid, { [PROJECTS.PROJECT_STAGE]: 'Warranty expired' }),
    ),
  )

  return NextResponse.json({ ok: true })
}) as (req: NextRequest) => Promise<NextResponse>
