import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAllProjects } from '@/lib/airtable'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({
      status: 'unauthenticated',
      message: 'Not logged in. Please log in first, then visit this URL again.',
    })
  }

  try {
    const projects = await getAllProjects()
    const sample = projects.slice(0, 3).map((p) => ({
      id: p.id,
      name: p.projectName,
      stage: p.projectStage,
    }))
    return NextResponse.json({
      status: 'ok',
      user: session.name,
      role: session.role,
      projectCount: projects.length,
      sampleProjects: sample,
      airtableBaseId: process.env.AIRTABLE_BASE_ID?.slice(0, 6) + '…',
      apiKeyPrefix: process.env.AIRTABLE_API_KEY?.slice(0, 8) + '…',
    })
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      user: session.name,
      role: session.role,
      error: error instanceof Error ? error.message : String(error),
      airtableBaseId: process.env.AIRTABLE_BASE_ID?.slice(0, 6) + '…',
      apiKeyPresent: !!process.env.AIRTABLE_API_KEY,
    })
  }
}
