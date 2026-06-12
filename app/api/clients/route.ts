import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAllClients } from '@/lib/airtable'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const clients = await getAllClients()
    return NextResponse.json({ clients })
  } catch (error) {
    console.error('GET /api/clients error:', error)
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 })
  }
}
