'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Project } from '@/lib/types'

interface QuotationRow {
  itemName: string
  description: string
  quantity: string
  unitPrice: string
}

function emptyRow(): QuotationRow {
  return { itemName: '', description: '', quantity: '1', unitPrice: '' }
}

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'

interface Props {
  project: Project
  onClose: () => void
  onCreated: () => void
}

export default function QuotationModal({ project, onClose, onCreated }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const [quotationDate, setQuotationDate] = useState(today)
  const [rows, setRows] = useState<QuotationRow[]>([emptyRow()])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<{ created: number } | null>(null)

  function updateRow(i: number, patch: Partial<QuotationRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()])
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i))
  }

  function rowTotal(row: QuotationRow): number {
    return (parseInt(row.quantity) || 0) * (parseFloat(row.unitPrice) || 0)
  }

  const grandTotal = rows.reduce((sum, r) => sum + rowTotal(r), 0)

  async function handleSave() {
    setErr('')
    if (!quotationDate) { setErr('Quotation date is required'); return }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (!r.itemName.trim()) { setErr(`Item ${i + 1}: name is required`); return }
      if (!r.description.trim()) { setErr(`Item ${i + 1}: description is required`); return }
      if (!r.quantity || parseInt(r.quantity) < 1) { setErr(`Item ${i + 1}: quantity must be ≥ 1`); return }
      if (r.unitPrice === '' || parseFloat(r.unitPrice) < 0) { setErr(`Item ${i + 1}: enter a unit price`); return }
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${project.id}/quotation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quotationDate,
          items: rows.map((r) => ({
            itemName: r.itemName.trim(),
            description: r.description.trim(),
            quantity: parseInt(r.quantity),
            unitPrice: parseFloat(r.unitPrice),
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      setResult({ created: data.created })
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const isCommunal = (project.communSeds?.length ?? 0) > 0

  if (result) {
    return (
      <Modal open onClose={onClose} title="F5 — Quotation Saved">
        <div className="space-y-3 text-sm">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-center font-semibold text-gray-900">
            {result.created} item{result.created !== 1 ? 's' : ''} added to{' '}
            <span className="font-mono">{project.projectId}</span>
          </p>
          <p className="text-center text-xs text-gray-500">
            Quotation date: {quotationDate} · Total: AED {grandTotal.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <div className="pt-2 flex justify-center">
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
      title={`F5 — Quotation Details — ${project.nickname ?? project.projectName}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>
            Save Quotation ({rows.length} item{rows.length !== 1 ? 's' : ''})
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {err && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</p>
        )}

        {/* Project-level header */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quotation Header</p>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-gray-400 mb-0.5">Project</p>
              <p className="font-mono font-semibold text-gray-800">{project.projectId}</p>
              <p className="text-gray-600 truncate">{project.projectName}</p>
            </div>
            <div>
              <p className="text-gray-400 mb-0.5">Client</p>
              <p className="font-semibold text-gray-800">{project.clientName}</p>
              {project.clientPhone && <p className="text-gray-500">{project.clientPhone}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Quotation Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                className={inp}
                value={quotationDate}
                onChange={(e) => setQuotationDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Communal Project</label>
              {isCommunal ? (
                <div className="flex flex-wrap gap-1 mt-1">
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                    Yes
                  </span>
                  {project.communSeds!.map((name) => (
                    <span key={name} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 mt-1.5">No</p>
              )}
            </div>
          </div>
        </div>

        {/* Item rows */}
        <div className="space-y-3">
          {rows.map((row, i) => {
            const total = rowTotal(row)
            return (
              <div key={i} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-white">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-700">Item {i + 1}</span>
                  {rows.length > 1 && (
                    <button
                      onClick={() => removeRow(i)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  )}
                </div>

                {/* Item Name */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Item Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    className={inp}
                    value={row.itemName}
                    onChange={(e) => updateRow(i, { itemName: e.target.value })}
                    placeholder="e.g. Kitchen Cabinet, Wardrobe, TV Unit…"
                  />
                </div>

                {/* Item Description */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Item Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    className={`${inp} resize-none`}
                    value={row.description}
                    onChange={(e) => updateRow(i, { description: e.target.value })}
                    placeholder="Dimensions, material, finish, colour, special requirements…"
                  />
                </div>

                {/* Qty / Price / Total */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Quantity <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className={inp}
                      value={row.quantity}
                      onChange={(e) => updateRow(i, { quantity: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Unit Price (AED) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={inp}
                      value={row.unitPrice}
                      onChange={(e) => updateRow(i, { unitPrice: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Total (AED)</label>
                    <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-sm font-semibold text-gray-700 tabular-nums">
                      {total > 0
                        ? total.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : '—'}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <button
          onClick={addRow}
          className="text-sm text-brand-600 hover:text-brand-700 font-medium"
        >
          + Add another item
        </button>

        {/* Grand total */}
        {grandTotal > 0 && (
          <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Grand Total</span>
            <span className="text-base font-bold text-gray-900 tabular-nums">
              AED {grandTotal.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </div>
    </Modal>
  )
}
