import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/apiHandler'
import { createHandoverSheet, uploadAttachmentToRecord } from '@/lib/airtable'
import { CreateHandoverSchema } from '@/lib/validation'
import { HANDOVER_SHEETS } from '@/lib/fieldMap'

export const POST = requireRole('installation', 'manager', 'superadmin')(
  async (req: NextRequest, _session, { params }) => {
    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = CreateHandoverSchema.safeParse({
      finalInstallationDate: formData.get('finalInstallationDate'),
      customerSatisfaction: formData.get('customerSatisfaction'),
      installationDifficulty: formData.get('installationDifficulty'),
      newsletterOptIn: formData.get('newsletterOptIn') === 'true',
      notes: formData.get('notes') || undefined,
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 },
      )
    }

    const signedDoc = formData.get('signedDocument') as File | null
    if (!signedDoc || signedDoc.size === 0) {
      return NextResponse.json({ error: 'Signed H.O. document is required' }, { status: 400 })
    }

    try {
      const sheet = await createHandoverSheet(params.id, parsed.data)

      // Upload signed document to the handover sheet's PDF field
      try {
        const buffer = Buffer.from(await signedDoc.arrayBuffer())
        await uploadAttachmentToRecord(sheet.id, HANDOVER_SHEETS.PDF, {
          name: signedDoc.name,
          type: signedDoc.type,
          buffer,
        })
      } catch (uploadErr) {
        console.error('[HANDOVER] Document upload failed:', uploadErr)
        // Sheet was created — continue even if upload fails
      }

      return NextResponse.json({ sheet })
    } catch (error) {
      console.error('POST /api/projects/[id]/handover error:', error)
      return NextResponse.json({ error: 'Failed to create handover sheet' }, { status: 500 })
    }
  },
)
