'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Project } from '@/lib/types'

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'
const lbl = 'block text-xs font-medium text-gray-500 mb-1'

export default function GatePassModal({
  project,
  onClose,
  onCreated,
}: {
  project: Project
  onClose: () => void
  onCreated: () => void
}) {
  const [itemsDescription, setItemsDescription] = useState('')
  const [estimatedSupplyDate, setEstimatedSupplyDate] = useState('')
  const [confirmedDeliveryDate, setConfirmedDeliveryDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  async function handleSave() {
    if (!itemsDescription.trim()) { setErr('Items description is required'); return }
    if (!estimatedSupplyDate) { setErr('Estimated supply date is required'); return }
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/gate-passes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: [project.id],
          itemsDescription: itemsDescription.trim(),
          estimatedSupplyDate,
          ...(confirmedDeliveryDate ? { confirmedDeliveryDate } : {}),
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setDone(true)
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create gate pass')
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <Modal open onClose={onClose} title="Gate Pass Created">
        <div className="py-6 text-center space-y-3">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-900">Gate pass created</p>
          <p className="text-xs text-gray-500">{project.projectName}</p>
          <Button onClick={onClose}>Done</Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Gate Pass — ${project.projectName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>Create Gate Pass</Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {err && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</p>
        )}

        <div>
          <label className={lbl}>Items Description *</label>
          <textarea
            rows={3}
            className={`${inp} resize-none`}
            value={itemsDescription}
            onChange={(e) => setItemsDescription(e.target.value)}
            placeholder="List of items to be delivered..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Estimated Supply Date *</label>
            <input type="date" className={inp} value={estimatedSupplyDate} onChange={(e) => setEstimatedSupplyDate(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>Confirmed Delivery Date</label>
            <input type="date" className={inp} value={confirmedDeliveryDate} onChange={(e) => setConfirmedDeliveryDate(e.target.value)} />
          </div>
        </div>
      </div>
    </Modal>
  )
}
