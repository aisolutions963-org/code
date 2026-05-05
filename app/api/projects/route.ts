import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getProjects, getAllProjects } from '@/lib/airtable'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const stage = searchParams.get('stage') ?? undefined
  const all = searchParams.get('all') === 'true'

  try {
    const projects = all ? await getAllProjects() : await getProjects({ stage })
    return NextResponse.json({ projects })
  } catch (error) {
    console.error('GET /api/projects error:', error)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}
