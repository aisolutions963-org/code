import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getSetting, setSetting } from '@/lib/db'

export const GET = requireRole('superadmin')(async () => {
  return NextResponse.json({
    accountantEmail: getSetting('accountant_email') ?? '',
  })
})

export const PATCH = requireRole('superadmin')(async (req: NextRequest) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { accountantEmail } = body as { accountantEmail?: unknown }
  if (typeof accountantEmail !== 'string' || !accountantEmail.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
  }

  setSetting('accountant_email', accountantEmail.trim().toLowerCase())
  return NextResponse.json({ accountantEmail: accountantEmail.trim().toLowerCase() })
})
