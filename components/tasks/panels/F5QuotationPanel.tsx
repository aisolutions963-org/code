'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput } from '@/lib/types'

type ActionPath = 'Site Visit (item)' | 'Select Sample (item)' | 'Design (item)' | 'Measurement (item)'

const ACTION_OPTIONS: { value: ActionPath; label: string }[] = [
  { value: 'Site Visit (item)', label: 'SED Site Visit' },
  { value: 'Select Sample (item)', label: 'Select/Order Sample' },
  { value: 'Design (item)', label: 'Design' },
  { value: 'Measurement (item)', label: 'Take Measurement' },
]

interface QuotationRow {
  itemName: string
  description: string
  quantity: string
  unitPrice: string
  actions: ActionPath[]
}

function emptyRow(): QuotationRow {
  return { itemName: '', description: '', quantity: '1', unitPrice: '', actions: [] }
}

function rowTotal(r: QuotationRow): number {
  return (parseInt(r.quantity) || 0) * (parseFloat(r.unitPrice) || 0)
}

const inp = 'w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400'

interface Props {
  task: Task
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

export default function F5QuotationPanel({ task, onUpdate }: Props) {
  const [rows, setRows] = useState<QuotationRow[]>([emptyRow()])
  const [quotationDate, setQuotationDate] = useState(new Date().toISOString().slice(0, 10))
  const [totalOverride, setTotalOverride] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const projectId = task.projectRecordId ?? task.project?.[0]
  const quotationNumber = task.projectQuotationNumber ?? ''
  const quotationReference = task.projectQuotationReference

  function updateRow(i: number, patch: Partial<QuotationRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function addRow() { setRows((prev) => [...prev, emptyRow()]) }
  function removeRow(i: number) { setRows((prev) => prev.filter((_, idx) => idx !== i)) }
  function toggleAction(i: number, action: ActionPath) {
    setRows((prev) => prev.map((r, idx) => {
      if (idx !== i) return r
      const has = r.actions.includes(action)
      return { ...r, actions: has ? r.actions.filter((a) => a !== action) : [...r.actions, action] }
    }))
  }

  const grandTotal = rows.reduce((s, r) => s + rowTotal(r), 0)

  async function handleSubmit() {
    setErr('')
    if (!projectId) { setErr('No project linked to this task'); return }
    if (!quotationNumber) { setErr('Quotation number not set — complete the Make Quotation task first'); return }
    if (!quotationDate) { setErr('Quotation date is required'); return }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (!r.itemName.trim()) { setErr(`Item ${i + 1}: name is required`); return }
      if (!r.description.trim()) { setErr(`Item ${i + 1}: description is required`); return }
      if (!r.quantity || parseInt(r.quantity) < 1) { setErr(`Item ${i + 1}: quantity must be ≥ 1`); return }
      if (r.unitPrice === '' || parseFloat(r.unitPrice) < 0) { setErr(`Item ${i + 1}: enter a unit price`); return }
      if (r.actions.length === 0) { setErr(`Item ${i + 1}: select at least one action`); return }
    }

    setSaving(true)
    try {
      const parsedOverride = totalOverride !== '' ? parseFloat(totalOverride) : undefined
      const totalAmountToPay = parsedOverride !== undefined && !isNaN(parsedOverride) ? parsedOverride : grandTotal

      const body: Record<string, unknown> = {
        quotationNumber: quotationNumber.trim(),
        quotationDate,
        totalAmountToPay,
        items: rows.map((r) => ({
          itemName: r.itemName.trim(),
          description: r.description.trim(),
          quantity: parseInt(r.quantity),
          unitPrice: parseFloat(r.unitPrice),
          actions: r.actions,
        })),
      }
      if (quotationReference) body.quotationReference = quotationReference

      const res = await fetch(`/api/projects/${projectId}/quotation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')

      await onUpdate(task.id, { status: 'Completed' })
      toast.success(`F5 submitted — ${rows.length} item${rows.length !== 1 ? 's' : ''} added`)
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

      {/* Quotation header info */}
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
      </div>

      {!quotationNumber && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          Complete the Make Quotation task first to set the quotation number.
        </p>
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
              <th className="text-left pb-1.5 pr-2 font-medium text-gray-500 min-w-[160px]">Actions *</th>
              <th className="w-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-blue-100">
            {rows.map((row, i) => {
              const total = rowTotal(row)
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
                    {total > 0 ? total.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                  </td>
                  <td className="py-1 pr-2">
                    <div className="flex flex-col gap-0.5">
                      {ACTION_OPTIONS.map((opt) => (
                        <label key={opt.value} className="flex items-center gap-1 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={row.actions.includes(opt.value)}
                            onChange={() => toggleAction(i, opt.value)}
                            className="accent-blue-600"
                          />
                          <span className="text-xs text-gray-700">{opt.label}</span>
                        </label>
                      ))}
                    </div>
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

      {/* Total */}
      <div className="flex items-center gap-3 pt-1 border-t border-blue-200">
        <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">Total to Pay (AED)</span>
        <input
          type="number"
          min="0"
          step="0.01"
          className={`${inp} text-right font-semibold`}
          value={totalOverride !== '' ? totalOverride : grandTotal > 0 ? grandTotal.toFixed(2) : ''}
          onChange={(e) => setTotalOverride(e.target.value)}
          placeholder="0.00"
        />
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
