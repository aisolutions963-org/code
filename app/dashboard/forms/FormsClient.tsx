'use client'

import { useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { Project, Role } from '@/lib/types'
import { todayUAE } from '@/lib/dateUtils'
import Button from '@/components/ui/Button'
import HandoverModal from '@/components/projects/HandoverModal'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const inp = 'w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'
const sel = `${inp} bg-white`
const lbl = 'text-xs text-gray-500 block mb-1'

function PaymentForm({ project }: { project: Project }) {
  const today = todayUAE()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    amount: '',
    paymentType: 'Advance',
    paymentStatus: 'Received',
    paymentMethod: 'Bank Transfer',
    referenceNo: '',
    receivedDate: today,
    dueDate: '',
    payerType: '',
    payerName: '',
    commission: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  function setF(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.amount || parseFloat(form.amount) <= 0) { setErr('Amount is required'); return }
    if (!form.receivedDate) { setErr('Date is required'); return }
    if (!form.referenceNo.trim()) { setErr('Reference No. is required'); return }
    if (!form.payerType) { setErr('Payer Type is required'); return }
    setSaving(true); setErr(''); setSaved(false)
    try {
      const body: Record<string, unknown> = {
        project: [project.id],
        amount: parseFloat(form.amount),
        paymentType: form.paymentType,
        paymentStatus: form.paymentStatus,
        paymentMethod: form.paymentMethod,
        referenceNo: form.referenceNo.trim(),
        receivedDate: form.receivedDate,
        payerType: form.payerType,
      }
      if (form.dueDate) body.dueDate = form.dueDate
      if (form.payerName.trim()) body.payerName = form.payerName.trim()
      if (form.payerType === 'Broker' && form.commission) body.commissionAmount = parseFloat(form.commission)
      if (form.notes.trim()) body.notes = form.notes.trim()

      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed') }
      setSaved(true)
      setShowForm(false)
      setForm({ amount: '', paymentType: 'Advance', paymentStatus: 'Received', paymentMethod: 'Bank Transfer', referenceNo: '', receivedDate: today, dueDate: '', payerType: '', payerName: '', commission: '', notes: '' })
      globalMutate('/api/projects')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-t border-gray-100 pt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Payment</span>
        <button
          onClick={() => { setShowForm((v) => !v); setSaved(false); setErr('') }}
          className="text-xs text-brand-600 hover:underline font-medium"
        >
          {showForm ? '− Cancel' : '+ Record payment'}
        </button>
      </div>
      {saved && !showForm && (
        <p className="text-xs text-green-600 mb-1">Payment saved.</p>
      )}
      {showForm && (
        <form onSubmit={submit} className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
          {err && <p className="col-span-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{err}</p>}
          <div>
            <label className={lbl}>Date *</label>
            <input type="date" value={form.receivedDate} onChange={(e) => setF('receivedDate', e.target.value)} className={inp} />
          </div>
          <div>
            <label className={lbl}>Amount (AED) *</label>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setF('amount', e.target.value)} className={inp} placeholder="0.00" />
          </div>
          <div>
            <label className={lbl}>Type</label>
            <select value={form.paymentType} onChange={(e) => setF('paymentType', e.target.value)} className={sel}>
              {['Advance', 'Delivery', 'Material', 'Final', 'Progressive Payment'].map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Status</label>
            <select value={form.paymentStatus} onChange={(e) => setF('paymentStatus', e.target.value)} className={sel}>
              {['Received', 'Pending', 'Overdue'].map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Method</label>
            <select value={form.paymentMethod} onChange={(e) => setF('paymentMethod', e.target.value)} className={sel}>
              {['Bank Transfer', 'Cash', 'Cheque'].map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Reference No. *</label>
            <input type="text" value={form.referenceNo} onChange={(e) => setF('referenceNo', e.target.value)} className={inp} placeholder="TRN / cheque no." />
          </div>
          <div>
            <label className={lbl}>Payer Type *</label>
            <select value={form.payerType} onChange={(e) => setF('payerType', e.target.value)} className={sel}>
              <option value="">— select —</option>
              {['Broker', 'Contractor', 'End User', 'Designer'].map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Payer Name</label>
            <input type="text" value={form.payerName} onChange={(e) => setF('payerName', e.target.value)} className={inp} placeholder="Full name" />
          </div>
          {form.payerType === 'Broker' && (
            <div className="col-span-2">
              <label className={lbl}>Commission Amount (AED)</label>
              <input type="number" min="0" step="0.01" value={form.commission} onChange={(e) => setF('commission', e.target.value)} className={inp} placeholder="0.00" />
            </div>
          )}
          <div>
            <label className={lbl}>Due Date</label>
            <input type="date" value={form.dueDate} onChange={(e) => setF('dueDate', e.target.value)} className={inp} />
          </div>
          <div>
            <label className={lbl}>Notes</label>
            <input type="text" value={form.notes} onChange={(e) => setF('notes', e.target.value)} className={inp} placeholder="Optional" />
          </div>
          <div className="col-span-2 flex items-center gap-3">
            <Button type="submit" size="sm" loading={saving}>Save Payment</Button>
          </div>
        </form>
      )}
    </div>
  )
}

const UNITS = ['pcs', 'm', 'm²', 'kg', 'set', 'box', 'roll'] as const
type Unit = typeof UNITS[number]

interface MaterialRow {
  name: string
  quantity: string
  unit: Unit | ''
  supplier: string
  notes: string
}

function MaterialOrderForm({ project }: { project: Project }) {
  const [showForm, setShowForm] = useState(false)
  const [orderType, setOrderType] = useState<'small' | 'big' | null>(null)
  const [stockNote, setStockNote] = useState('')
  const [rows, setRows] = useState<MaterialRow[]>([{ name: '', quantity: '', unit: '', supplier: '', notes: '' }])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  function reset() {
    setOrderType(null); setStockNote(''); setSaved(false); setErr('')
    setRows([{ name: '', quantity: '', unit: '', supplier: '', notes: '' }])
  }
  function addRow() { setRows((r) => [...r, { name: '', quantity: '', unit: '', supplier: '', notes: '' }]) }
  function removeRow(i: number) { setRows((r) => r.filter((_, idx) => idx !== i)) }
  function updateRow(i: number, key: keyof MaterialRow, value: string) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (!orderType) { setErr('Choose an order type first'); return }
    const valid = rows.filter((r) => r.name.trim())
    if (valid.length === 0) { setErr('Add at least one material'); return }
    const bad = valid.find((r) => !r.quantity || !r.unit)
    if (bad) { setErr(`"${bad.name}": quantity and unit are required`); return }
    setSaving(true); setSaved(false)
    try {
      const res = await fetch('/api/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purpose: 'Project',
          projectId: project.id,
          orderType,
          ...(stockNote.trim() ? { stockCheckNote: stockNote.trim() } : {}),
          items: valid.map((r) => ({
            name: r.name.trim(),
            quantity: parseFloat(r.quantity),
            unit: r.unit,
            ...(r.supplier.trim() ? { supplier: r.supplier.trim() } : {}),
            ...(r.notes.trim() ? { notes: r.notes.trim() } : {}),
          })),
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed') }
      setSaved(true)
      setShowForm(false)
      reset()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-t border-gray-100 pt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Material Order</span>
        <button
          onClick={() => { setShowForm((v) => !v); if (showForm) reset() }}
          className="text-xs text-brand-600 hover:underline font-medium"
        >
          {showForm ? '− Cancel' : '+ Order materials'}
        </button>
      </div>
      {saved && !showForm && (
        <p className="text-xs text-green-600 mb-1">Material order submitted.</p>
      )}
      {showForm && (
        <form onSubmit={submit} className="space-y-3 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{err}</p>}

          {/* Order type selector — mirrors F3 panel */}
          <div>
            <p className="text-xs font-semibold text-emerald-800 mb-2">
              Order Type <span className="font-normal text-emerald-700">— choose before submitting</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOrderType('small')}
                className={`text-left px-3 py-2.5 rounded-lg text-xs font-semibold border-2 transition-all ${
                  orderType === 'small'
                    ? 'border-emerald-500 bg-emerald-100 text-emerald-900'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-emerald-300'
                }`}
              >
                <div className="font-bold">Small Order</div>
                <div className="font-normal mt-0.5 opacity-80">Order directly</div>
              </button>
              <button
                type="button"
                onClick={() => setOrderType('big')}
                className={`text-left px-3 py-2.5 rounded-lg text-xs font-semibold border-2 transition-all ${
                  orderType === 'big'
                    ? 'border-amber-500 bg-amber-50 text-amber-900'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-amber-300'
                }`}
              >
                <div className="font-bold">Big Order</div>
                <div className="font-normal mt-0.5 opacity-80">Fabrication checks store first</div>
              </button>
            </div>
          </div>

          {orderType && <div className="overflow-x-auto">
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
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-2">
                      <input
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white"
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
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white"
                        value={row.quantity}
                        onChange={(e) => updateRow(i, 'quantity', e.target.value)}
                        placeholder="0"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <select
                        className="w-full border border-gray-200 rounded px-1 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
                        value={row.unit}
                        onChange={(e) => updateRow(i, 'unit', e.target.value)}
                      >
                        <option value="">—</option>
                        {UNITS.map((u) => <option key={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white"
                        value={row.supplier}
                        onChange={(e) => updateRow(i, 'supplier', e.target.value)}
                        placeholder="Supplier"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white"
                        value={row.notes}
                        onChange={(e) => updateRow(i, 'notes', e.target.value)}
                        placeholder="Spec, colour…"
                      />
                    </td>
                    <td className="py-1">
                      {rows.length > 1 && (
                        <button type="button" onClick={() => removeRow(i)} className="text-gray-300 hover:text-red-400 text-base leading-none">×</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}

          {orderType && (
            <button type="button" onClick={addRow} className="text-xs text-emerald-700 hover:text-emerald-900 font-medium">
              + Add row
            </button>
          )}

          {orderType === 'big' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Stock Check Note</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
                value={stockNote}
                onChange={(e) => setStockNote(e.target.value)}
                placeholder="Any instructions for the store check…"
              />
            </div>
          )}

          <Button
            type="submit"
            size="sm"
            loading={saving}
          >
            {orderType === 'big' ? 'Send to Fabrication for Store Check' : 'Submit Order'}
          </Button>
        </form>
      )}
    </div>
  )
}

function HandoverSection({ project, onCreated }: { project: Project; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t border-gray-100 pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Handover</span>
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-brand-600 hover:underline font-medium"
        >
          + Open handover form
        </button>
      </div>
      {open && (
        <HandoverModal
          projectId={project.id}
          projectName={project.projectName ?? ''}
          onClose={() => setOpen(false)}
          onCreated={() => { setOpen(false); onCreated() }}
        />
      )}
    </div>
  )
}

function ProjectCard({ project, canPay, canOrderMaterials, onRefresh }: { project: Project; canPay: boolean; canOrderMaterials: boolean; onRefresh: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-900">{project.projectName}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {project.clientName ?? '—'} · {project.projectStage ?? '—'}
        </p>
      </div>
      {canPay && <PaymentForm project={project} />}
      {canOrderMaterials && <MaterialOrderForm project={project} />}
      <HandoverSection project={project} onCreated={onRefresh} />
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function FormsClient({ role }: { role: Role }) {
  const { data, isLoading, error, mutate } = useSWR<{ projects: Project[] }>(
    '/api/projects',
    fetcher,
    { refreshInterval: 300_000 },
  )

  const canPay = role === 'manager' || role === 'superadmin'
  const canOrderMaterials = role === 'sed' || role === 'manager' || role === 'superadmin'
  const projects = data?.projects ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Forms</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {isLoading ? 'Loading…' : `${projects.length} project${projects.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={() => mutate()}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white border border-gray-200 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {isLoading && <Spinner />}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            Failed to load projects.{' '}
            <button onClick={() => mutate()} className="underline">Retry</button>
          </div>
        )}

        {!isLoading && !error && projects.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm font-semibold text-gray-700">No active projects</p>
            <p className="text-xs text-gray-400 mt-1">Projects will appear here once created.</p>
          </div>
        )}

        {!isLoading && projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            canPay={canPay}
            canOrderMaterials={canOrderMaterials}
            onRefresh={() => mutate()}
          />
        ))}
      </div>
    </div>
  )
}
