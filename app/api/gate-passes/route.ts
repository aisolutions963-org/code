import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createGatePass, getGatePassesByProject, getAllGatePasses } from '@/lib/airtable'
import { GatePassCreateInput } from '@/lib/types'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const projectId = request.nextUrl.searchParams.get('projectId')

  if (projectId) {
    try {
      const gatePasses = await getGatePassesByProject(projectId)
      return NextResponse.json({ gatePasses })
    } catch (error) {
      console.error('GET /api/gate-passes error:', error)
      return NextResponse.json({ error: 'Failed to fetch gate passes' }, { status: 500 })
    }
  }

  if (!['manager', 'superadmin', 'installation'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const gatePasses = await getAllGatePasses()
    return NextResponse.json({ gatePasses })
  } catch (error) {
    console.error('GET /api/gate-passes error:', error)
    return NextResponse.json({ error: 'Failed to fetch gate passes' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || (session.role !== 'manager' && session.role !== 'superadmin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: GatePassCreateInput
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { project, itemsDescription, estimatedSupplyDate } = body
  if (!project?.length || !itemsDescription || !estimatedSupplyDate) {
    return NextResponse.json(
      { error: 'project, itemsDescription, and estimatedSupplyDate are required' },
      { status: 400 },
    )
  }

  try {
    const gatePass = await createGatePass(body)
    return NextResponse.json({ gatePass }, { status: 201 })
  } catch (error) {
    console.error('POST /api/gate-passes error:', error)
    return NextResponse.json({ error: 'Failed to create gate pass' }, { status: 500 })
  }
}
