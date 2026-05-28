'use client'

import { useRef, useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'
const sel = `${inp} bg-white`

const SATISFACTION_OPTIONS = ['Very Satisfied', 'Satisfied', 'Neutral', 'Unsatisfied'] as const
const DIFFICULTY_OPTIONS = ['Easy', 'Medium', 'Hard', 'Very Hard'] as const

function openHandoverPrint(
  projectName: string,
  data: {
    finalInstallationDate: string
    customerSatisfaction: string
    installationDifficulty: string
    newsletterOptIn: boolean
    notes: string
  },
  handoverId: string,
) {
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Handover Sheet — ${projectName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 40px; max-width: 800px; margin: 0 auto; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    .subtitle { color: #666; font-size: 12px; margin-bottom: 32px; }
    .section { border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 20px; overflow: hidden; }
    .section-header { background: #f5f5f5; padding: 10px 16px; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #444; border-bottom: 1px solid #e0e0e0; }
    .field-row { display: flex; padding: 10px 16px; border-bottom: 1px solid #f0f0f0; }
    .field-row:last-child { border-bottom: none; }
    .field-label { width: 180px; flex-shrink: 0; color: #666; font-size: 12px; }
    .field-value { flex: 1; font-weight: 500; }
    .sig-box { border: 1px solid #ccc; border-radius: 6px; height: 70px; margin-top: 6px; }
    .sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 16px; }
    .sig-label { font-size: 11px; color: #888; margin-bottom: 4px; }
    .footer { margin-top: 32px; text-align: center; font-size: 10px; color: #aaa; }
    @media print { body { padding: 20px; } @page { margin: 15mm; } }
  </style>
</head>
<body>
  <h1>Handover Sheet</h1>
  <p class="subtitle">WoodWings · Generated ${date}</p>

  <div class="section">
    <div class="section-header">Project Information</div>
    <div class="field-row">
      <span class="field-label">Project Name</span>
      <span class="field-value">${projectName}</span>
    </div>
    <div class="field-row">
      <span class="field-label">Handover ID</span>
      <span class="field-value" style="font-family:monospace;font-size:11px;color:#555;">${handoverId}</span>
    </div>
    <div class="field-row">
      <span class="field-label">Final Installation Date</span>
      <span class="field-value">${data.finalInstallationDate}</span>
    </div>
    <div class="field-row">
      <span class="field-label">Status</span>
      <span class="field-value">Generated — Client Signature Pending</span>
    </div>
  </div>

  <div class="section">
    <div class="section-header">Installation Feedback</div>
    <div class="field-row">
      <span class="field-label">Customer Satisfaction</span>
      <span class="field-value">${data.customerSatisfaction}</span>
    </div>
    <div class="field-row">
      <span class="field-label">Installation Difficulty</span>
      <span class="field-value">${data.installationDifficulty}</span>
    </div>
    <div class="field-row">
      <span class="field-label">Newsletter Opt-in</span>
      <span class="field-value">${data.newsletterOptIn ? 'Yes' : 'No'}</span>
    </div>
    ${data.notes ? `<div class="field-row">
      <span class="field-label">Notes</span>
      <span class="field-value" style="white-space:pre-line;">${data.notes}</span>
    </div>` : ''}
  </div>

  <div class="section">
    <div class="section-header">Handover Confirmation</div>
    <div class="sig-row">
      <div>
        <div class="sig-label">Client Signature</div>
        <div class="sig-box"></div>
        <div style="margin-top:6px;font-size:11px;color:#aaa;">Name: _________________ &nbsp; Date: _________</div>
      </div>
      <div>
        <div class="sig-label">WoodWings Representative</div>
        <div class="sig-box"></div>
        <div style="margin-top:6px;font-size:11px;color:#aaa;">Name: _________________ &nbsp; Date: _________</div>
      </div>
    </div>
  </div>

  <div class="footer">WoodWings · Handover Sheet · ${handoverId}</div>

  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (win) setTimeout(() => URL.revokeObjectURL(url), 60000)
}

export default function HandoverModal({
  projectId,
  projectName,
  onClose,
  onCreated,
}: {
  projectId: string
  projectName: string
  onClose: () => void
  onCreated: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [finalInstallationDate, setFinalInstallationDate] = useState('')
  const [customerSatisfaction, setCustomerSatisfaction] = useState('')
  const [installationDifficulty, setInstallationDifficulty] = useState('')
  const [newsletterOptIn, setNewsletterOptIn] = useState(false)
  const [notes, setNotes] = useState('')
  const [fileName, setFileName] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const [handoverId, setHandoverId] = useState('')
  const [savedData, setSavedData] = useState<Parameters<typeof openHandoverPrint>[1] | null>(null)

  async function handleGenerate() {
    setErr('')
    if (!finalInstallationDate) { setErr('Final installation date is required'); return }
    if (!customerSatisfaction) { setErr('Customer satisfaction is required'); return }
    if (!installationDifficulty) { setErr('Installation difficulty is required'); return }
    // Signed document is optional — can be added later if client signs on site
    const file = fileRef.current?.files?.[0]
    if (file && file.size > 20 * 1024 * 1024) { setErr('File must be under 20 MB'); return }

    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('finalInstallationDate', finalInstallationDate)
      fd.append('customerSatisfaction', customerSatisfaction)
      fd.append('installationDifficulty', installationDifficulty)
      fd.append('newsletterOptIn', String(newsletterOptIn))
      if (notes.trim()) fd.append('notes', notes.trim())
      if (file) fd.append('signedDocument', file)

      const res = await fetch(`/api/projects/${projectId}/handover`, { method: 'POST', body: fd })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      const data = await res.json()
      const id = data.sheet.handoverId ?? data.sheet.id

      const printData = {
        finalInstallationDate,
        customerSatisfaction,
        installationDifficulty,
        newsletterOptIn,
        notes: notes.trim(),
      }
      setSavedData(printData)
      setHandoverId(id)
      setDone(true)
      onCreated()
      openHandoverPrint(projectName, printData, id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to generate')
    } finally {
      setSaving(false)
    }
  }

  if (done && savedData) {
    return (
      <Modal open onClose={onClose} title="F6 — Handover Sheet Generated">
        <div className="py-6 text-center space-y-4">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Handover submitted — awaiting final payment</p>
            {handoverId && <p className="text-xs font-mono text-gray-400 mt-0.5">{handoverId}</p>}
            <p className="text-xs text-gray-500 mt-0.5">{projectName}</p>
          </div>
          <p className="text-xs text-gray-400">Print dialog opened — save as PDF or print directly.</p>
          <div className="flex justify-center gap-3">
            <Button variant="secondary" onClick={() => openHandoverPrint(projectName, savedData, handoverId)}>
              Re-open PDF
            </Button>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="F6 — Handover Form"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleGenerate} loading={saving}>Submit Handover</Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {err && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</p>
        )}

        {/* Project — read-only */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 space-y-0.5">
          <p className="text-xs text-gray-500">Project</p>
          <p className="font-medium text-gray-900">{projectName}</p>
        </div>

        {/* Final Installation Date */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Final Installation Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            className={inp}
            value={finalInstallationDate}
            onChange={(e) => setFinalInstallationDate(e.target.value)}
          />
        </div>

        {/* Customer Satisfaction */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Customer Satisfaction <span className="text-red-500">*</span>
          </label>
          <select
            className={sel}
            value={customerSatisfaction}
            onChange={(e) => setCustomerSatisfaction(e.target.value)}
          >
            <option value="">Select…</option>
            {SATISFACTION_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        {/* Installation Difficulty */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Installation Difficulty <span className="text-red-500">*</span>
          </label>
          <select
            className={sel}
            value={installationDifficulty}
            onChange={(e) => setInstallationDifficulty(e.target.value)}
          >
            <option value="">Select…</option>
            {DIFFICULTY_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        {/* Signed H.O. Document */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Signed H.O. Document <span className="text-gray-400">(optional)</span>
          </label>
          <div
            className="border border-gray-300 rounded-lg px-3 py-2.5 flex items-center gap-3 cursor-pointer hover:border-brand-400 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            <span className={`text-sm ${fileName ? 'text-gray-900' : 'text-gray-400'}`}>
              {fileName || 'Choose file (PDF, JPG, PNG — max 20 MB)'}
            </span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
          />
        </div>

        {/* Newsletter Opt-in */}
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            checked={newsletterOptIn}
            onChange={(e) => setNewsletterOptIn(e.target.checked)}
          />
          <span className="text-sm text-gray-700">Subscribe client to newsletter</span>
        </label>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Notes (optional)</label>
          <textarea
            rows={3}
            className={`${inp} resize-none`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes for the handover sheet…"
          />
        </div>

        <p className="text-xs text-gray-400">
          Submitting this form records the handover and notifies the team to request final payment from the client. The project closes automatically once the final payment is recorded.
        </p>
      </div>
    </Modal>
  )
}
