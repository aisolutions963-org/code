'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Project } from '@/lib/types'
import { todayUAE } from '@/lib/dateUtils'

const PURPOSE_OPTIONS = ['Project', 'Office', 'Factory', 'Cars', 'Other'] as const
const UNIT_OPTIONS = ['pcs', 'm', 'm²', 'kg', 'set', 'box', 'roll'] as const

interface Row {
  name: string
  supplier: string
  quantity: string
  unit: string
  neededByDate: string
  notes: string
}

function emptyRow(): Row {
  return { name: '', supplier: '', quantity: '', unit: '', neededByDate: '', notes: '' }
}

const inp = 'w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'
const sel = `${inp} bg-white`

export default function MaterialOrderModal({
  projects,
  onClose,
  onCreated,
}: {
  projects: Project[]
  onClose: () => void
  onCreated: () => void
}) {
  const today = todayUAE()
  const [purpose, setPurpose] = useState<string>('')
  const [projectId, setProjectId] = useState<string>('')
  const [rows, setRows] = useState<Row[]>([emptyRow()])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const [createdCount, setCreatedCount] = useState(0)

  function updateRow(i: number, key: keyof Row, value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)))
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()])
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    setErr('')
    if (!purpose) { setErr('Purpose is required'); return }
    if (purpose === 'Project' && !projectId) { setErr('Project is required when purpose is Project'); return }

    const validRows = rows.filter((r) => r.name.trim())
    if (validRows.length === 0) { setErr('At least one material name is required'); return }

    const badRow = validRows.find((r) => !r.quantity || !r.unit)
    if (badRow) { setErr(`Row "${badRow.name}": Quantity and Unit are required`); return }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        purpose,
        items: validRows.map((r) => ({
          name: r.name.trim(),
          quantity: parseFloat(r.quantity),
          unit: r.unit,
          ...(r.supplier.trim() ? { supplier: r.supplier.trim() } : {}),
          ...(r.neededByDate ? { neededByDate: r.neededByDate } : {}),
          ...(r.notes.trim() ? { notes: r.notes.trim() } : {}),
        })),
      }
      if (purpose === 'Project' && projectId) body.projectId = projectId

      const res = await fetch('/api/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
          <p className="text-sm font-semibold text-gray-900">
            {createdCount} material{createdCount !== 1 ? 's' : ''} ordered
          </p>
          <p className="text-xs text-gray-500">Purpose: {purpose}</p>
          <Button onClick={onClose}>Done</Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="F3 — Material Order"
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
      <div className="space-y-4">
        {err && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</p>
        )}

        {/* Header fields */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Order Details</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Purpose <span className="text-red-500">*</span>
              </label>
              <select className={sel} value={purpose} onChange={(e) => { setPurpose(e.target.value); setProjectId('') }}>
                <option value="">Select…</option>
                {PURPOSE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            {purpose === 'Project' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Project <span className="text-red-500">*</span>
                </label>
                <select className={sel} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">Select project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.projectId} — {p.projectName}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs text-gray-500">
            <div>
              <span className="font-medium text-gray-600">Request Date</span>
              <p>{today}</p>
            </div>
            <div>
              <span className="font-medium text-gray-600">Requested By</span>
              <p>Current user (auto)</p>
            </div>
          </div>
        </div>

        {/* Row table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left pb-2 pr-2 font-medium text-gray-500 min-w-[150px]">Material Name <span className="text-red-500">*</span></th>
                <th className="text-left pb-2 pr-2 font-medium text-gray-500 min-w-[110px]">Supplier</th>
                <th className="text-left pb-2 pr-2 font-medium text-gray-500 w-20">Qty <span className="text-red-500">*</span></th>
                <th className="text-left pb-2 pr-2 font-medium text-gray-500 w-20">Unit <span className="text-red-500">*</span></th>
                <th className="text-left pb-2 pr-2 font-medium text-gray-500 w-32">Needed By</th>
                <th className="text-left pb-2 pr-2 font-medium text-gray-500 min-w-[110px]">Notes</th>
                <th className="w-5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((row, i) => (
                <tr key={i}>
                  <td className="py-1.5 pr-2">
                    <input
                      className={inp}
                      value={row.name}
                      onChange={(e) => updateRow(i, 'name', e.target.value)}
                      placeholder="e.g. MDF 18mm"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      className={inp}
                      value={row.supplier}
                      onChange={(e) => updateRow(i, 'supplier', e.target.value)}
                      placeholder="Supplier"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={inp}
                      value={row.quantity}
                      onChange={(e) => updateRow(i, 'quantity', e.target.value)}
                      placeholder="0"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <select
                      className={sel}
                      value={row.unit}
                      onChange={(e) => updateRow(i, 'unit', e.target.value)}
                    >
                      <option value="">—</option>
                      {UNIT_OPTIONS.map((u) => <option key={u}>{u}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      type="date"
                      className={inp}
                      value={row.neededByDate}
                      onChange={(e) => updateRow(i, 'neededByDate', e.target.value)}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      className={inp}
                      value={row.notes}
                      onChange={(e) => updateRow(i, 'notes', e.target.value)}
                      placeholder="Color, spec…"
                    />
                  </td>
                  <td className="py-1.5">
                    {rows.length > 1 && (
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

        <button onClick={addRow} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
          + Add row
        </button>
      </div>
    </Modal>
  )
}
