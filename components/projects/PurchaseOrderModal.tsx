'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Project } from '@/lib/types'

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'
const lbl = 'block text-xs font-medium text-gray-500 mb-1'

export default function PurchaseOrderModal({
  project,
  onClose,
  onCreated,
}: {
  project: Project
  onClose: () => void
  onCreated: () => void
}) {
  const [supplier, setSupplier] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10))
  const [expectedDelivery, setExpectedDelivery] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  async function handleSave() {
    if (!supplier.trim()) { setErr('Supplier is required'); return }
    setSaving(true); setErr('')
    try {
      const body: Record<string, unknown> = { supplier: supplier.trim() }
      if (totalAmount) body.totalAmount = parseFloat(totalAmount)
      if (orderDate) body.orderDate = orderDate
      if (expectedDelivery) body.expectedDelivery = expectedDelivery
      if (notes.trim()) body.notes = notes.trim()

      const res = await fetch(`/api/projects/${project.id}/purchase-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setDone(true)
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create purchase order')
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <Modal open onClose={onClose} title="Purchase Order Created">
        <div className="py-6 text-center space-y-3">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-900">Purchase order created (Draft)</p>
          <p className="text-xs text-gray-500">{project.projectName} — {supplier}</p>
          <Button onClick={onClose}>Done</Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`New Purchase Order — ${project.projectName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>Create PO</Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {err && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</p>
        )}

        <div>
          <label className={lbl}>Supplier *</label>
          <input className={inp} value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Supplier name" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Total Amount (AED)</label>
            <input type="number" min="0" step="0.01" className={inp} value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className={lbl}>Order Date</label>
            <input type="date" className={inp} value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label className={lbl}>Expected Delivery</label>
          <input type="date" className={inp} value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
        </div>

        <div>
          <label className={lbl}>Notes</label>
          <textarea rows={2} className={`${inp} resize-none`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes for this PO..." />
        </div>

        <p className="text-xs text-gray-400">New POs are created with status "Draft". Update status in Airtable after manager approval.</p>
      </div>
    </Modal>
  )
}
