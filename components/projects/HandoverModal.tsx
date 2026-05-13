'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'

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
      setHandoverId(data.sheet.handoverId ?? data.sheet.id)
      setDone(true)
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to generate')
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <Modal open onClose={onClose} title="F6 — Handover Sheet Generated">
        <div className="py-6 text-center space-y-3">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-900">Handover sheet created</p>
          {handoverId && <p className="text-xs font-mono text-gray-400">{handoverId}</p>}
          <p className="text-xs text-gray-500">{projectName}</p>
          <p className="text-xs text-gray-400">Status: Generated — client signature pending</p>
          <Button onClick={onClose}>Done</Button>
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
          <Button onClick={handleGenerate} loading={saving}>Generate Sheet</Button>
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
          Creates a Handover Sheet record with status "Generated". Client signature is recorded as a separate step.
        </p>
      </div>
    </Modal>
  )
}
