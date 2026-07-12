'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput } from '@/lib/types'
import { todayUAE } from '@/lib/dateUtils'

interface QuotationRow {
  itemName: string
  description: string
  quantity: string
  unitPrice: string
}

function emptyRow(): QuotationRow {
  return { itemName: '', description: '', quantity: '1', unitPrice: '' }
}

function rowTotal(r: QuotationRow): number {
  return (parseInt(r.quantity) || 0) * (parseFloat(r.unitPrice) || 0)
}

function fmt(n: number): string {
  return n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const inp = 'w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400'

interface Props {
  task: Task
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

export default function F5QuotationPanel({ task, onUpdate }: Props) {
  const [rows, setRows] = useState<QuotationRow[]>([emptyRow()])
  const [quotationDate, setQuotationDate] = useState(todayUAE())
  const [quotationRef, setQuotationRef] = useState(task.projectQuotationReference ?? '')
  const [revision, setRevision] = useState('')
  const [discount, setDiscount] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const projectId = task.projectRecordId ?? task.project?.[0]
  const quotationNumber = task.projectQuotationNumber ?? ''

  function updateRow(i: number, patch: Partial<QuotationRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function addRow() { setRows((prev) => [...prev, emptyRow()]) }
  function removeRow(i: number) { setRows((prev) => prev.filter((_, idx) => idx !== i)) }

  const subtotal = rows.reduce((s, r) => s + rowTotal(r), 0)
  const discountAmount = parseFloat(discount) || 0
  const afterDiscount = Math.max(0, subtotal - discountAmount)
  const vatAmount = afterDiscount * 0.05
  const total = parseFloat((afterDiscount * 1.05).toFixed(2))

  const sedOwners = [task.projectSalesOwner, ...(task.projectCommunSeds ?? [])].filter(Boolean)

  async function handleSubmit() {
    setErr('')
    if (!projectId) { setErr('No project linked to this task'); return }
    if (!quotationNumber) { setErr('Quotation number not set — complete the Make Quotation task first'); return }
    if (!quotationRef.trim()) { setErr('Quotation reference is required'); return }
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
      const body: Record<string, unknown> = {
        quotationNumber: quotationNumber.trim(),
        quotationReference: quotationRef.trim(),
        quotationDate,
        revision: revision.trim(),
        totalAmountToPay: total,
        items: rows.map((r) => ({
          itemName: r.itemName.trim(),
          description: r.description.trim(),
          quantity: parseInt(r.quantity),
          unitPrice: parseFloat(r.unitPrice),
        })),
      }

      const res = await fetch(`/api/projects/${projectId}/quotation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')

      await onUpdate(task.id, { status: 'Completed' })
      toast.success(`F5 submitted — ${rows.length} item${rows.length !== 1 ? 's' : ''}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
      toast.error('Failed to submit F5')
    } finally {
      setSaving(false)
    }
  }

  if (task.status === 'Completed') return null

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-3 space-y-3">
      <p className="text-xs font-semibold text-blue-800">
        F5 — Quotation Details{' '}
        <span className="font-normal text-blue-700">— add items, then submit</span>
      </p>

      {/* Quotation header */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Quotation Number</p>
          <div className={`text-xs font-mono font-semibold px-2 py-1 rounded border ${quotationNumber ? 'bg-white border-gray-200 text-gray-800' : 'bg-amber-50 border-amber-300 text-amber-700'}`}>
            {quotationNumber || 'Not set yet'}
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-0.5">Quotation Date</label>
          <input
            type="date"
            className={inp}
            value={quotationDate}
            onChange={(e) => setQuotationDate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-0.5">Quotation Reference *</label>
          <input
            className={inp}
            value={quotationRef}
            onChange={(e) => setQuotationRef(e.target.value)}
            placeholder="e.g. REF-2024-001"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-0.5">Revision</label>
          <input
            className={inp}
            value={revision}
            onChange={(e) => setRevision(e.target.value)}
            placeholder="e.g. R0, R1"
          />
        </div>
      </div>

      {!quotationNumber && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          Complete the Make Quotation task first to set the quotation number.
        </p>
      )}

      {/* SED owners */}
      {sedOwners.length > 0 && (
        <div className="bg-white border border-blue-100 rounded px-2 py-1.5">
          <span className="text-xs text-gray-400">SED Owners: </span>
          <span className="text-xs text-gray-700 font-medium">{sedOwners.join(', ')}</span>
        </div>
      )}

      {/* Item rows */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-blue-200">
              <th className="text-left pb-1.5 pr-2 font-medium text-gray-500 min-w-[120px]">Item *</th>
              <th className="text-left pb-1.5 pr-2 font-medium text-gray-500 min-w-[120px]">Description *</th>
              <th className="text-left pb-1.5 pr-2 font-medium text-gray-500 w-14">Qty *</th>
              <th className="text-left pb-1.5 pr-2 font-medium text-gray-500 w-20">Unit Price *</th>
              <th className="text-left pb-1.5 pr-2 font-medium text-gray-500 w-20">Total</th>
              <th className="w-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-blue-100">
            {rows.map((row, i) => {
              const rowTot = rowTotal(row)
              return (
                <tr key={i}>
                  <td className="py-1 pr-2">
                    <input
                      className={inp}
                      value={row.itemName}
                      onChange={(e) => updateRow(i, { itemName: e.target.value })}
                      placeholder="Kitchen Cabinet…"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      className={inp}
                      value={row.description}
                      onChange={(e) => updateRow(i, { description: e.target.value })}
                      placeholder="Dimensions, material…"
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className={inp}
                      value={row.quantity}
                      onChange={(e) => updateRow(i, { quantity: e.target.value })}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={inp}
                      value={row.unitPrice}
                      onChange={(e) => updateRow(i, { unitPrice: e.target.value })}
                      placeholder="0.00"
                    />
                  </td>
                  <td className="py-1 pr-2 tabular-nums text-gray-600 font-mono">
                    {rowTot > 0 ? fmt(rowTot) : '—'}
                  </td>
                  <td className="py-1">
                    {rows.length > 1 && (
                      <button onClick={() => removeRow(i)} className="text-gray-300 hover:text-red-400 text-base leading-none">×</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <button type="button" onClick={addRow} className="text-xs text-blue-700 hover:text-blue-900 font-medium">
        + Add item
      </button>

      {/* Pricing summary */}
      <div className="border-t border-blue-200 pt-2 space-y-1">
        <div className="flex justify-between text-xs text-gray-600">
          <span>Subtotal</span>
          <span className="font-mono tabular-nums">AED {fmt(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-gray-600">
          <label htmlFor="f5-discount">Discount (AED)</label>
          <input
            id="f5-discount"
            type="number"
            min="0"
            step="0.01"
            className="w-32 border border-gray-200 rounded px-2 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            placeholder="0.00"
          />
        </div>
        {discountAmount > 0 && (
          <div className="flex justify-between text-xs text-gray-600">
            <span>After discount</span>
            <span className="font-mono tabular-nums">AED {fmt(afterDiscount)}</span>
          </div>
        )}
        <div className="flex justify-between text-xs text-gray-500">
          <span>VAT (5%)</span>
          <span className="font-mono tabular-nums">AED {fmt(vatAmount)}</span>
        </div>
        <div className="flex justify-between text-xs font-semibold text-gray-800 border-t border-blue-200 pt-1">
          <span>Total (incl. VAT)</span>
          <span className="font-mono tabular-nums">AED {fmt(total)}</span>
        </div>
      </div>

      {err && <p className="text-xs text-red-600">{err}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving || !quotationNumber}
        className="w-full py-2 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Submitting…' : `Submit F5 (${rows.length} item${rows.length !== 1 ? 's' : ''})`}
      </button>
    </div>
  )
}
