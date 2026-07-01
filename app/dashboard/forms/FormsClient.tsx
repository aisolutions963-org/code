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

// Stages where a handover form is relevant
const HANDOVER_STAGES = new Set(['Production', 'Closing'])

// ─── Payment Form ─────────────────────────────────────────────────────────────

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
      if (form.payerName.trim()) body.payerName = form.payerName.trim()
      if (form.payerType === 'Broker' && form.commission) body.commissionAmount = parseFloat(form.commission)
      if (form.notes.trim()) body.notes = form.notes.trim()

      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed') }

      // Create a calendar event on the date entered in the form
      fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${form.paymentType} — ${project.projectName}`,
          date: form.receivedDate,
          projectId: project.id,
        }),
      }).catch(() => undefined)

      setSaved(true)
      setShowForm(false)
      setForm({ amount: '', paymentType: 'Advance', paymentStatus: 'Received', paymentMethod: 'Bank Transfer', referenceNo: '', receivedDate: today, payerType: '', payerName: '', commission: '', notes: '' })
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
              {['Advance', 'Delivery', 'Material', 'Final', 'Progressive Payment', 'Trade', 'Variance', 'Maintenance'].map((v) => <option key={v}>{v}</option>)}
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

// ─── F3 Material Order Modal ──────────────────────────────────────────────────

const UNITS = ['pcs', 'm', 'm²', 'kg', 'set', 'box', 'roll'] as const
type Unit = typeof UNITS[number]
const PURPOSES = ['Project', 'Office', 'Factory', 'Cars', 'Other'] as const
type Purpose = typeof PURPOSES[number]

interface MaterialRow {
  name: string
  quantity: string
  unit: Unit | ''
  supplier: string
  neededBy: string
  notes: string
}

const EMPTY_ROW: MaterialRow = { name: '', quantity: '', unit: '', supplier: '', neededBy: '', notes: '' }

function F3Modal({
  projects,
  onClose,
  onSubmitted,
}: {
  projects: Project[]
  onClose: () => void
  onSubmitted: () => void
}) {
  const today = todayUAE()
  const [purpose, setPurpose] = useState<Purpose>('Project')
  const [projectId, setProjectId] = useState('')
  const [orderType, setOrderType] = useState<'small' | 'big' | null>(null)
  const [rows, setRows] = useState<MaterialRow[]>([EMPTY_ROW, EMPTY_ROW])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function addRow() { setRows((r) => [...r, { ...EMPTY_ROW }]) }
  function removeRow(i: number) { setRows((r) => r.filter((_, idx) => idx !== i)) }
  function updateRow(i: number, key: keyof MaterialRow, value: string) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)))
  }

  const validRows = rows.filter((r) => r.name.trim())

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (!orderType) { setErr('Select an order type (Small or Big)'); return }
    if (purpose === 'Project' && !projectId) { setErr('Select a project'); return }
    if (validRows.length === 0) { setErr('Add at least one material'); return }
    const bad = validRows.find((r) => !r.quantity || !r.unit)
    if (bad) { setErr(`"${bad.name}": quantity and unit are required`); return }

    setSaving(true)
    try {
      const res = await fetch('/api/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purpose,
          ...(purpose === 'Project' ? { projectId } : {}),
          orderType,
          items: validRows.map((r) => ({
            name: r.name.trim(),
            quantity: parseFloat(r.quantity),
            unit: r.unit,
            ...(r.supplier.trim() ? { supplier: r.supplier.trim() } : {}),
            ...(r.neededBy ? { neededByDate: r.neededBy } : {}),
            ...(r.notes.trim() ? { notes: r.notes.trim() } : {}),
          })),
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed') }
      onSubmitted()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  const rowInp = 'w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/40" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-sm font-bold text-gray-800">F3 — Material Order</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Order Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Purpose <span className="text-red-500">*</span></label>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={purpose}
                    onChange={(e) => { setPurpose(e.target.value as Purpose); setProjectId('') }}
                  >
                    {PURPOSES.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Project {purpose === 'Project' && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-100 disabled:text-gray-400"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    disabled={purpose !== 'Project'}
                  >
                    <option value="">Select project…</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.projectName}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs text-gray-500">
                <div>
                  <span className="font-medium text-gray-400">Request Date</span>
                  <p className="text-gray-700 mt-0.5">{today}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-400">Requested By</span>
                  <p className="text-gray-700 mt-0.5">Current user (auto)</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {(['small', 'big'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setOrderType(t)}
                  className={`text-left px-4 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                    orderType === t
                      ? t === 'small'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                        : 'border-amber-500 bg-amber-50 text-amber-900'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <div>{t === 'small' ? 'Small Order' : 'Big Order'}</div>
                  <div className="text-xs font-normal mt-0.5 opacity-70">
                    {t === 'small' ? 'Order directly' : 'Fabrication checks store first'}
                  </div>
                </button>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left pb-2 pr-2 font-semibold text-gray-500 min-w-[140px]">Material Name <span className="text-red-400">*</span></th>
                    <th className="text-left pb-2 pr-2 font-semibold text-gray-500 min-w-[100px]">Supplier</th>
                    <th className="text-left pb-2 pr-2 font-semibold text-gray-500 w-16">Qty <span className="text-red-400">*</span></th>
                    <th className="text-left pb-2 pr-2 font-semibold text-gray-500 w-20">Unit <span className="text-red-400">*</span></th>
                    <th className="text-left pb-2 pr-2 font-semibold text-gray-500 w-32">Needed By</th>
                    <th className="text-left pb-2 pr-2 font-semibold text-gray-500 min-w-[100px]">Notes</th>
                    <th className="w-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, i) => (
                    <tr key={i}>
                      <td className="py-1.5 pr-2">
                        <input className={rowInp} value={row.name} onChange={(e) => updateRow(i, 'name', e.target.value)} placeholder="e.g. MDF 18mm" />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input className={rowInp} value={row.supplier} onChange={(e) => updateRow(i, 'supplier', e.target.value)} placeholder="Supplier" />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input type="number" min="0" step="0.01" className={rowInp} value={row.quantity} onChange={(e) => updateRow(i, 'quantity', e.target.value)} placeholder="0" />
                      </td>
                      <td className="py-1.5 pr-2">
                        <select className={rowInp} value={row.unit} onChange={(e) => updateRow(i, 'unit', e.target.value)}>
                          <option value="">—</option>
                          {UNITS.map((u) => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="py-1.5 pr-2">
                        <input type="date" className={rowInp} value={row.neededBy} onChange={(e) => updateRow(i, 'neededBy', e.target.value)} />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input className={rowInp} value={row.notes} onChange={(e) => updateRow(i, 'notes', e.target.value)} placeholder="Color, spec…" />
                      </td>
                      <td className="py-1.5">
                        {rows.length > 1 && (
                          <button type="button" onClick={() => removeRow(i)} className="text-gray-300 hover:text-red-400 text-base leading-none">×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" onClick={addRow} className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium">
                + Add row
              </button>
            </div>

            {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
          </div>

          <div className="border-t border-gray-100 px-5 py-4 flex items-center justify-between shrink-0">
            <p className="text-xs text-gray-400">
              Purpose can be: {PURPOSES.join(' / ')}
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Submitting…' : `Submit Order (${validRows.length})`}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Handover Section ─────────────────────────────────────────────────────────

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
          quotationNumber={project.quotationNumber}
          quotationReference={project.quotationReference}
          onClose={() => setOpen(false)}
          onCreated={() => { setOpen(false); onCreated() }}
        />
      )}
    </div>
  )
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ project, canPay, canHandover, onRefresh }: { project: Project; canPay: boolean; canHandover: boolean; onRefresh: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-900">{project.projectName}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {project.clientName ?? '—'} · {project.projectStage ?? '—'}
        </p>
      </div>
      {canPay && <PaymentForm project={project} />}
      {canHandover && <HandoverSection project={project} onCreated={onRefresh} />}
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

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function FormsClient({ role }: { role: Role }) {
  const { data, isLoading, error, mutate } = useSWR<{ projects: Project[] }>(
    '/api/projects',
    fetcher,
    { refreshInterval: 300_000 },
  )

  const [showF3, setShowF3] = useState(false)
  const [f3Saved, setF3Saved] = useState(false)

  const canPay = role === 'manager' || role === 'superadmin'
  const canOrderMaterials = role === 'sed' || role === 'manager' || role === 'fabrication' || role === 'superadmin'
  const canHandover = role === 'installation' || role === 'manager' || role === 'superadmin'

  const allProjects = data?.projects ?? []

  // For handover: only show projects in active production/closing stages
  const handoverProjects = canHandover
    ? allProjects.filter((p) => !p.projectStage || HANDOVER_STAGES.has(p.projectStage))
    : []

  // For payment: show all active projects
  const paymentProjects = canPay ? allProjects : []

  // Projects shown as cards: union of handover + payment projects (deduped)
  const cardProjectIds = new Set([
    ...handoverProjects.map((p) => p.id),
    ...paymentProjects.map((p) => p.id),
  ])
  const cardProjects = allProjects.filter((p) => cardProjectIds.has(p.id))

  const subtitle = isLoading
    ? 'Loading…'
    : canHandover || canPay
      ? `${cardProjects.length} project${cardProjects.length !== 1 ? 's' : ''}`
      : 'Submit material orders'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Forms</h1>
            <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
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

        {/* F3 Material Order */}
        {canOrderMaterials && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">F3 — Material Order</p>
              <p className="text-xs text-gray-400 mt-0.5">Order materials for a project, office, factory or other</p>
              {f3Saved && <p className="text-xs text-green-600 mt-1">Order submitted successfully.</p>}
            </div>
            <button
              onClick={() => { setShowF3(true); setF3Saved(false) }}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 transition-colors shrink-0"
            >
              + New Order
            </button>
          </div>
        )}

        {isLoading && <Spinner />}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            Failed to load projects.{' '}
            <button onClick={() => mutate()} className="underline">Retry</button>
          </div>
        )}

        {/* Project cards — only for roles that have payment or handover actions */}
        {(canPay || canHandover) && !isLoading && !error && cardProjects.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm font-semibold text-gray-700">
              {canHandover && !canPay ? 'No projects in Production or Closing stage' : 'No active projects'}
            </p>
            <p className="text-xs text-gray-400 mt-1">Projects will appear here once they reach the relevant stage.</p>
          </div>
        )}

        {(canPay || canHandover) && !isLoading && cardProjects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            canPay={canPay}
            canHandover={canHandover && HANDOVER_STAGES.has(project.projectStage ?? '')}
            onRefresh={() => mutate()}
          />
        ))}
      </div>

      {showF3 && (
        <F3Modal
          projects={allProjects}
          onClose={() => setShowF3(false)}
          onSubmitted={() => { setF3Saved(true); mutate() }}
        />
      )}
    </div>
  )
}
