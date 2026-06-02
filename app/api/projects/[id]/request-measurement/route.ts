import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getProjectById, createAdHocTask, measurementTaskExists } from '@/lib/airtable'
import { createNotification } from '@/lib/notifications'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await getSession()
  if (!session || !['sed', 'manager', 'superadmin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const project = await getProjectById(id)

    const alreadyExists = await measurementTaskExists(id)
    if (alreadyExists) {
      return NextResponse.json(
        { error: 'A measurement task already exists for this project.' },
        { status: 409 },
      )
    }

    await createAdHocTask({
      taskName: 'Take Measurements',
      projectId: id,
      departments: ['Installation'],
    })

    createNotification({
      recipientRole: 'installation',
      title: `Measurement requested: ${project.projectName}`,
      body: `${session.name} has asked the installation team to take measurements. Please choose a date.`,
      link: '/dashboard/fix',
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('POST /api/projects/[id]/request-measurement error:', error)
    return NextResponse.json({ error: 'Failed to request measurement' }, { status: 500 })
  }
}
