import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { PAYABLES } from '@/lib/fieldMap'

const BASE_ID = process.env.AIRTABLE_BASE_ID!
const API_KEY = process.env.AIRTABLE_API_KEY!
const BASE_URL = `https://api.airtable.com/v0/${BASE_ID}`

export const DELETE = requireRole('manager', 'superadmin')(
  async (_req: NextRequest, _session, { params }) => {
    const res = await fetch(`${BASE_URL}/${PAYABLES.TABLE}/${params.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${API_KEY}` },
    })
    if (!res.ok) {
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  },
)
