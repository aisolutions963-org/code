import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { getSetting } from '@/lib/db'
import { Resend } from 'resend'

export const GET = requireRole('superadmin')(async (req: NextRequest) => {
  const apiKey = process.env.RESEND_API_KEY
  const accountantEmail = await getSetting('accountant_email').catch(() => null)
  const managerEmail = process.env.MANAGER_EMAIL ?? null
  const appUrl = process.env.APP_URL ?? null
  const vercelUrl = process.env.VERCEL_URL ?? null

  const config = {
    resend_api_key_set: !!apiKey,
    resend_api_key_prefix: apiKey ? apiKey.slice(0, 8) + '…' : null,
    accountant_email_in_db: accountantEmail ?? '(not set)',
    manager_email_env: managerEmail ?? '(not set)',
    app_url: appUrl ?? '(not set)',
    vercel_url: vercelUrl ?? '(not set)',
  }

  // ?send=1 → actually attempt a test email to the accountant address
  const trySend = req.nextUrl.searchParams.get('send') === '1'
  if (!trySend || !apiKey || !accountantEmail) {
    return NextResponse.json({ config, test_send: null })
  }

  try {
    const resend = new Resend(apiKey)
    const result = await resend.emails.send({
      from: 'WoodWings <notifications@woodwings.ae>',
      to: accountantEmail,
      subject: 'WoodWings — Test Email',
      html: '<h2>Test email</h2><p>If you received this, Resend is configured correctly.</p>',
    })
    return NextResponse.json({ config, test_send: { ok: true, result } })
  } catch (err) {
    return NextResponse.json({
      config,
      test_send: {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
    })
  }
})
