import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { handleTaskCompletion } from '@/lib/workflow'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { taskId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { taskId } = body
  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
  }

  try {
    const result = await handleTaskCompletion(taskId)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('POST /api/workflow/unlock error:', error)
    return NextResponse.json({ error: 'Workflow execution failed' }, { status: 500 })
  }
}
