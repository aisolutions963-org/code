'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Task, TaskUpdateInput } from '@/lib/types'

interface F3OrderPanelProps {
  task: Task
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

export default function F3OrderPanel({ task, onUpdate }: F3OrderPanelProps) {
  const [f3Path, setF3Path] = useState<'small' | 'big' | null>(null)
  const [f3Items, setF3Items] = useState([{ name: '', quantity: '', unit: '', supplier: '', notes: '' }])
  const [f3Notes, setF3Notes] = useState('')
  const [f3Saving, setF3Saving] = useState(false)
  const [f3Error, setF3Error] = useState('')

  function addRow() {
    setF3Items((prev) => [...prev, { name: '', quantity: '', unit: '', supplier: '', notes: '' }])
  }
  function removeRow(i: number) {
    setF3Items((prev) => prev.filter((_, idx) => idx !== i))
  }
  function updateRow(i: number, key: string, value: string) {
    setF3Items((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)))
  }

  async function handleSubmit() {
    setF3Error('')
    if (!f3Path) { setF3Error('Choose an order type'); return }
    const valid = f3Items.filter((r) => r.name.trim())
    if (valid.length === 0) { setF3Error('Add at least one material'); return }
    const bad = valid.find((r) => !r.quantity || !r.unit)
    if (bad) { setF3Error(`"${bad.name}": quantity and unit are required`); return }
    setF3Saving(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}/f3-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: f3Path,
          items: valid.map((r) => ({
            name: r.name.trim(),
            quantity: parseFloat(r.quantity),
            unit: r.unit,
            ...(r.supplier.trim() ? { supplier: r.supplier.trim() } : {}),
            ...(r.notes.trim() ? { notes: r.notes.trim() } : {}),
          })),
          generalNotes: f3Notes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Failed')
      }
      toast.success(
        f3Path === 'small'
          ? 'Order submitted'
          : 'Sent to Fabrication for store check',
      )
      // (path 'small' = order directly; 'big' = store check first — internal value kept)
      await onUpdate(task.id, {})
    } catch (e) {
      setF3Error(e instanceof Error ? e.message : 'Failed')
      toast.error('Failed')
    } finally {
      setF3Saving(false)
    }
  }

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-3 space-y-3">
      <p className="text-xs font-semibold text-emerald-800">
        Material Order Type{' '}
        <span className="font-normal text-emerald-700">— choose before submitting</span>
      </p>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setF3Path('small')}
          className={`text-left px-3 py-2.5 rounded-lg text-xs font-semibold border-2 transition-all ${
            f3Path === 'small'
              ? 'border-emerald-500 bg-emerald-100 text-emerald-900'
              : 'border-gray-200 bg-white text-gray-700 hover:border-emerald-300'
          }`}
        >
          <div className="font-bold">Order Directly</div>
          <div className="font-normal mt-0.5 opacity-80">Order without a store check</div>
        </button>
        <button
          type="button"
          onClick={() => setF3Path('big')}
          className={`text-left px-3 py-2.5 rounded-lg text-xs font-semibold border-2 transition-all ${
            f3Path === 'big'
              ? 'border-amber-500 bg-amber-50 text-amber-900'
              : 'border-gray-200 bg-white text-gray-700 hover:border-amber-300'
          }`}
        >
          <div className="font-bold">Big Order</div>
          <div className="font-normal mt-0.5 opacity-80">Fabrication checks store first</div>
        </button>
      </div>

      {f3Path && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-emerald-200">
                  <th className="text-left pb-1.5 pr-2 font-medium text-gray-500 min-w-[130px]">Material *</th>
                  <th className="text-left pb-1.5 pr-2 font-medium text-gray-500 w-16">Qty *</th>
                  <th className="text-left pb-1.5 pr-2 font-medium text-gray-500 w-20">Unit *</th>
                  <th className="text-left pb-1.5 pr-2 font-medium text-gray-500 min-w-[90px]">Supplier</th>
                  <th className="text-left pb-1.5 pr-2 font-medium text-gray-500 min-w-[90px]">Notes</th>
                  <th className="w-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-100">
                {f3Items.map((row, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-2">
                      <input
                        className="w-full border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                        value={row.name}
                        onChange={(e) => updateRow(i, 'name', e.target.value)}
                        placeholder="e.g. MDF 18mm"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-full border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                        value={row.quantity}
                        onChange={(e) => updateRow(i, 'quantity', e.target.value)}
                        placeholder="0"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <select
                        className="w-full border border-gray-200 rounded px-1 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
                        value={row.unit}
                        onChange={(e) => updateRow(i, 'unit', e.target.value)}
                      >
                        <option value="">—</option>
                        {['pcs', 'm', 'm²', 'kg', 'set', 'box', 'roll'].map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        className="w-full border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                        value={row.supplier}
                        onChange={(e) => updateRow(i, 'supplier', e.target.value)}
                        placeholder="Supplier"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        className="w-full border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                        value={row.notes}
                        onChange={(e) => updateRow(i, 'notes', e.target.value)}
                        placeholder="Spec, colour…"
                      />
                    </td>
                    <td className="py-1">
                      {f3Items.length > 1 && (
                        <button
                          onClick={() => removeRow(i)}
                          className="text-gray-300 hover:text-red-400 text-base leading-none"
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={addRow}
            className="text-xs text-emerald-700 hover:text-emerald-900 font-medium"
          >
            + Add row
          </button>

          {f3Path === 'big' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Stock Check Note
              </label>
              <input
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                value={f3Notes}
                onChange={(e) => setF3Notes(e.target.value)}
                placeholder="Any instructions for the store check…"
              />
            </div>
          )}

          {f3Error && <p className="text-xs text-red-600">{f3Error}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={f3Saving}
            className={`w-full py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-60 transition-colors ${
              f3Path === 'small' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-500 hover:bg-amber-600'
            }`}
          >
            {f3Saving
              ? 'Submitting…'
              : f3Path === 'small'
                ? `Submit Order (${f3Items.filter((r) => r.name.trim()).length} item${f3Items.filter((r) => r.name.trim()).length !== 1 ? 's' : ''})`
                : 'Send to Fabrication for Store Check'}
          </button>
        </>
      )}
    </div>
  )
}
