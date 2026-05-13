'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Project } from '@/lib/types'

const UNITS = ['m²', 'm', 'pcs', 'kg', 'set', 'box', 'roll'] as const

interface Row {
  name: string
  supplier: string
  quantity: string
  unit: string
  unitCost: string
  expectedArrivalDate: string
  notes: string
}

function emptyRow(): Row {
  return { name: '', supplier: '', quantity: '', unit: '', unitCost: '', expectedArrivalDate: '', notes: '' }
}

const inp = 'w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'
const sel = `${inp} bg-white`

export default function MaterialOrderModal({
  project,
  onClose,
  onCreated,
}: {
  project: Project
  onClose: () => void
  onCreated: () => void
}) {
  const [rows, setRows] = useState<Row[]>([emptyRow()])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const [createdCount, setCreatedCount] = useState(0)

  function updateRow(i: number, key: keyof Row, value: string) {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [key]: value } : r))
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()])
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    const validRows = rows.filter((r) => r.name.trim())
    if (validRows.length === 0) { setErr('At least one material name is required'); return }
    setSaving(true); setErr('')
    try {
      const items = validRows.map((r) => ({
        name: r.name.trim(),
        ...(r.supplier.trim() ? { supplier: r.supplier.trim() } : {}),
        ...(r.quantity ? { quantity: parseFloat(r.quantity) } : {}),
        ...(r.unit ? { unit: r.unit } : {}),
        ...(r.unitCost ? { unitCost: parseFloat(r.unitCost) } : {}),
        ...(r.expectedArrivalDate ? { expectedArrivalDate: r.expectedArrivalDate } : {}),
        ...(r.notes.trim() ? { notes: r.notes.trim() } : {}),
      }))
      const res = await fetch(`/api/projects/${project.id}/materials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      const data = await res.json()
      setCreatedCount(data.created)
      setDone(true)
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <Modal open onClose={onClose} title="F3 — Material Order">
        <div className="py-6 text-center space-y-3">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-900">{createdCount} material{createdCount !== 1 ? 's' : ''} ordered</p>
          <p className="text-xs text-gray-500">Project: {project.projectName}</p>
          <Button onClick={onClose}>Done</Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`F3 — Order Materials — ${project.projectName}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>
            Submit Order ({rows.filter((r) => r.name.trim()).length})
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {err && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left pb-2 pr-2 font-medium text-gray-500 min-w-[160px]">Material Name *</th>
                <th className="text-left pb-2 pr-2 font-medium text-gray-500 min-w-[120px]">Supplier</th>
                <th className="text-left pb-2 pr-2 font-medium text-gray-500 w-20">Qty</th>
                <th className="text-left pb-2 pr-2 font-medium text-gray-500 w-20">Unit</th>
                <th className="text-left pb-2 pr-2 font-medium text-gray-500 w-24">Unit Cost</th>
                <th className="text-left pb-2 pr-2 font-medium text-gray-500 w-32">Expected By</th>
                <th className="text-left pb-2 pr-2 font-medium text-gray-500 min-w-[120px]">Notes</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((row, i) => (
                <tr key={i}>
                  <td className="py-1.5 pr-2">
                    <input className={inp} value={row.name} onChange={(e) => updateRow(i, 'name', e.target.value)} placeholder="e.g. MDF 18mm" />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input className={inp} value={row.supplier} onChange={(e) => updateRow(i, 'supplier', e.target.value)} placeholder="Supplier name" />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input type="number" min="0" step="0.01" className={inp} value={row.quantity} onChange={(e) => updateRow(i, 'quantity', e.target.value)} placeholder="0" />
                  </td>
                  <td className="py-1.5 pr-2">
                    <select className={sel} value={row.unit} onChange={(e) => updateRow(i, 'unit', e.target.value)}>
                      <option value="">—</option>
                      {UNITS.map((u) => <option key={u}>{u}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <input type="number" min="0" step="0.01" className={inp} value={row.unitCost} onChange={(e) => updateRow(i, 'unitCost', e.target.value)} placeholder="AED" />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input type="date" className={inp} value={row.expectedArrivalDate} onChange={(e) => updateRow(i, 'expectedArrivalDate', e.target.value)} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input className={inp} value={row.notes} onChange={(e) => updateRow(i, 'notes', e.target.value)} placeholder="Notes" />
                  </td>
                  <td className="py-1.5">
                    {rows.length > 1 && (
                      <button onClick={() => removeRow(i)} className="text-gray-300 hover:text-red-400 text-base leading-none">×</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={addRow}
          className="text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          + Add row
        </button>

        {rows.some((r) => r.unitCost && r.quantity) && (
          <p className="text-xs text-gray-500 text-right">
            Est. total: AED{' '}
            {rows
              .reduce((s, r) => s + (parseFloat(r.unitCost || '0') * parseFloat(r.quantity || '0')), 0)
              .toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
        )}
      </div>
    </Modal>
  )
}
