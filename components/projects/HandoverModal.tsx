'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'

function openHandoverPrint(projectName: string, notes: string, handoverId: string) {
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
    .field-label { width: 160px; shrink-to-fit: none; flex-shrink: 0; color: #666; font-size: 12px; }
    .field-value { flex: 1; font-weight: 500; }
    .sig-box { border: 1px solid #ccc; border-radius: 6px; height: 70px; margin-top: 6px; }
    .sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 16px; }
    .sig-label { font-size: 11px; color: #888; margin-bottom: 4px; }
    .footer { margin-top: 32px; text-align: center; font-size: 10px; color: #aaa; }
    @media print {
      body { padding: 20px; }
      @page { margin: 15mm; }
    }
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
      <span class="field-label">Date</span>
      <span class="field-value">${date}</span>
    </div>
    <div class="field-row">
      <span class="field-label">Status</span>
      <span class="field-value">Generated — Client Signature Pending</span>
    </div>
    ${notes ? `<div class="field-row">
      <span class="field-label">Notes</span>
      <span class="field-value" style="white-space:pre-line;">${notes}</span>
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
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const [handoverId, setHandoverId] = useState('')
  const [savedNotes, setSavedNotes] = useState('')

  async function handleGenerate() {
    setSaving(true); setErr('')
    try {
      const res = await fetch(`/api/projects/${projectId}/handover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes.trim() || undefined }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      const data = await res.json()
      const id = data.sheet.handoverId ?? data.sheet.id
      setSavedNotes(notes.trim())
      setHandoverId(id)
      setDone(true)
      onCreated()
      openHandoverPrint(projectName, notes.trim(), id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to generate')
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <Modal open onClose={onClose} title="F6 — Handover Sheet Generated">
        <div className="py-6 text-center space-y-4">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Handover sheet created</p>
            {handoverId && <p className="text-xs font-mono text-gray-400 mt-0.5">{handoverId}</p>}
            <p className="text-xs text-gray-500 mt-0.5">{projectName}</p>
          </div>
          <p className="text-xs text-gray-400">Print dialog opened — save as PDF or print directly.</p>
          <div className="flex justify-center gap-3">
            <Button
              variant="secondary"
              onClick={() => openHandoverPrint(projectName, savedNotes, handoverId)}
            >
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
      title={`F6 — Generate Handover Sheet`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleGenerate} loading={saving}>Generate & Download PDF</Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {err && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</p>
        )}

        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 space-y-1">
          <p className="text-xs text-gray-500">Project</p>
          <p className="font-medium text-gray-900">{projectName}</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Notes (optional)</label>
          <textarea
            rows={3}
            className={`${inp} resize-none`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes for the handover sheet..."
          />
        </div>

        <p className="text-xs text-gray-400">
          Creates a Handover Sheet record and opens a print-ready PDF. Client signature is recorded separately.
        </p>
      </div>
    </Modal>
  )
}
