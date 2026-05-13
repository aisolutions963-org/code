'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Project, ItemType } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface QuotationRow {
  itemTypeId: string
  itemTypeName: string
  quantity: string
  unitPrice: string
  description: string
}

function emptyRow(): QuotationRow {
  return { itemTypeId: '', itemTypeName: '', quantity: '1', unitPrice: '', description: '' }
}

interface Props {
  project: Project
  onClose: () => void
  onCreated: () => void
}

export default function QuotationModal({ project, onClose, onCreated }: Props) {
  const [rows, setRows] = useState<QuotationRow[]>([emptyRow()])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<{ created: number } | null>(null)

  const { data: typesData } = useSWR<{ itemTypes: ItemType[] }>('/api/item-types', fetcher)
  const itemTypes = typesData?.itemTypes ?? []

  function updateRow(index: number, patch: Partial<QuotationRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()])
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  function handleTypeChange(index: number, id: string) {
    const found = itemTypes.find((t) => t.id === id)
    updateRow(index, { itemTypeId: id, itemTypeName: found?.name ?? '' })
  }

  async function handleSave() {
    setErr('')
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (!r.itemTypeId) { setErr(`Row ${i + 1}: select an item type`); return }
      if (!r.quantity || parseInt(r.quantity) < 1) { setErr(`Row ${i + 1}: quantity must be ≥ 1`); return }
      if (!r.unitPrice || parseFloat(r.unitPrice) < 0) { setErr(`Row ${i + 1}: enter a unit price`); return }
    }

    setSaving(true)
    try {
      const items = rows.map((r) => ({
        itemTypeId: r.itemTypeId,
        itemTypeName: r.itemTypeName,
        quantity: parseInt(r.quantity),
        unitPrice: parseFloat(r.unitPrice),
        description: r.description || undefined,
      }))
      const res = await fetch(`/api/projects/${project.id}/quotation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
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

  const total = rows.reduce((sum, r) => {
    const qty = parseInt(r.quantity) || 0
    const price = parseFloat(r.unitPrice) || 0
    return sum + qty * price
  }, 0)

  if (result) {
    return (
      <Modal open onClose={onClose} title="F5 — Items Saved">
        <div className="space-y-3 text-sm">
          <p className="text-green-700 font-medium">
            {result.created} item{result.created !== 1 ? 's' : ''} added to{' '}
            <span className="font-mono">{project.projectId}</span>.
          </p>
          <p className="text-gray-500 text-xs">
            Project Items and Quotation records created in Airtable.
          </p>
          <div className="pt-2">
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`F5 — Quotation by Item — ${project.nickname ?? project.projectName}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>Save Items</Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {err && (
          <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{err}</p>
        )}

        <div className="text-xs text-gray-500">
          Project: <span className="font-mono font-medium text-gray-700">{project.projectId}</span>
          {' — '}{project.clientName}
        </div>

        {/* Rows */}
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-3 bg-gray-50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">Item {i + 1}</span>
                {rows.length > 1 && (
                  <button
                    onClick={() => removeRow(i)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Item Type */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Item Type *</label>
                  <select
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                    value={row.itemTypeId}
                    onChange={(e) => handleTypeChange(i, e.target.value)}
                  >
                    <option value="">— select item type —</option>
                    {itemTypes.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                {/* Quantity */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    value={row.quantity}
                    onChange={(e) => updateRow(i, { quantity: e.target.value })}
                  />
                </div>

                {/* Unit Price */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Unit Price (AED) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    value={row.unitPrice}
                    onChange={(e) => updateRow(i, { unitPrice: e.target.value })}
                    placeholder="0.00"
                  />
                </div>

                {/* Description */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Description / Notes</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    value={row.description}
                    onChange={(e) => updateRow(i, { description: e.target.value })}
                    placeholder="Dimensions, finish, special requirements..."
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={addRow}
          className="text-sm text-brand-600 hover:text-brand-700 font-medium"
        >
          + Add another item
        </button>

        {total > 0 && (
          <div className="border-t border-gray-200 pt-3 text-right">
            <span className="text-xs text-gray-500">Estimated Total: </span>
            <span className="font-semibold text-gray-900">
              AED {total.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </div>
    </Modal>
  )
}
