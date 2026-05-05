import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getMaintenanceRecords, getProjectById } from '@/lib/airtable'

export const GET = requireRole('superadmin')(async () => {
  const records = await getMaintenanceRecords()

  const sorted = [...records].sort(
    (a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime(),
  )

  const allProjectIds = Array.from(new Set(sorted.flatMap((r) => r.projects ?? [])))
  const projectNames: Record<string, string> = {}
  if (allProjectIds.length > 0) {
    await Promise.all(
      allProjectIds.map(async (id) => {
        try {
          const p = await getProjectById(id)
          projectNames[id] = p.projectName
        } catch {
          projectNames[id] = id
        }
      }),
    )
  }

  const enriched = sorted.map((r) => ({
    ...r,
    daysRemaining: Math.ceil(
      (new Date(r.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    ),
    projectNames: (r.projects ?? []).map((id) => projectNames[id] ?? id),
  }))

  return NextResponse.json({ records: enriched })
})
