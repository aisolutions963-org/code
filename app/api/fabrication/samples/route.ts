import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getSamplesSentToFab } from '@/lib/airtable'

// Read-only feed of samples SED has sent to fabrication to build.
export const GET = requireRole('fabrication', 'manager', 'superadmin')(async () => {
  try {
    const tasks = await getSamplesSentToFab()
    const samples = tasks.map((t) => ({
      taskId: t.id,
      projectName: t.projectName ?? t.projectRef ?? '',
      projectNickname: t.projectNickname ?? null,
      projectRef: t.projectRef ?? null,
      itemName: t.projectItemName ?? null,
      sentToFabAt: t.sentToFabAt ?? null,
      note: t.sedNote ?? null,
      links: t.taskDocLinks ?? [],
    }))
    return NextResponse.json({ samples })
  } catch (error) {
    console.error('GET /api/fabrication/samples error:', error)
    return NextResponse.json({ error: 'Failed to fetch samples' }, { status: 500 })
  }
})
