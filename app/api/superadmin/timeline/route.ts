import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getAllProjects, getCalendarEvents } from '@/lib/airtable'

export const GET = requireRole('superadmin')(async () => {
  const [projects, events] = await Promise.all([
    getAllProjects(),
    getCalendarEvents(),
  ])

  const activeProjects = projects.filter(
    (p) => !['Closed', 'Warranty Done'].includes(p.projectStage),
  )

  const projectByHumanId = new Map<string, (typeof activeProjects)[0]>()
  for (const p of activeProjects) {
    if (p.projectId) projectByHumanId.set(p.projectId, p)
  }

  const now = Date.now()
  const windowStart = now - 30 * 24 * 60 * 60 * 1000
  const windowEnd = now + 90 * 24 * 60 * 60 * 1000

  const itemsByProjectHumanId = new Map<
    string,
    Array<{ id: string; title: string; date: string; type: string }>
  >()

  for (const event of events) {
    if (!event.projectId) continue
    const t = new Date(event.date).getTime()
    if (t < windowStart || t > windowEnd) continue
    if (!projectByHumanId.has(event.projectId)) continue
    if (!itemsByProjectHumanId.has(event.projectId)) {
      itemsByProjectHumanId.set(event.projectId, [])
    }
    itemsByProjectHumanId.get(event.projectId)!.push({
      id: event.id,
      title: event.title,
      date: event.date,
      type: event.type,
    })
  }

  const result = activeProjects.map((p) => ({
    id: p.id,
    projectId: p.projectId,
    projectName: p.projectName,
    clientName: p.clientName,
    projectStage: p.projectStage,
    projectCreatedAt: p.projectCreatedAt,
    items: (itemsByProjectHumanId.get(p.projectId) ?? []).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    ),
  }))

  return NextResponse.json({ projects: result })
})
