'use client'

import { useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { Project, Role } from '@/lib/types'
import { todayUAE } from '@/lib/dateUtils'
import Button from '@/components/ui/Button'
import NewProjectModal from '@/components/projects/NewProjectModal'
import HandoverModal from '@/components/projects/HandoverModal'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const inp = 'w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'
const sel = `${inp} bg-white`
const lbl = 'text-xs text-gray-500 block mb-1'

// F6 handover is only relevant once a project has reached the Closing stage.
const HANDOVER_STAGE = 'Closing'

// ─── F4 Payment Form ────────────────────────────────────────────────────────

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

// ─── F6 Handover Section ────────────────────────────────────────────────────

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

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function FormsClient({ role }: { role: Role }) {
  const { data, isLoading, error, mutate } = useSWR<{ projects: Project[] }>(
    '/api/projects',
    fetcher,
    { refreshInterval: 300_000 },
  )

  const [showNewProject, setShowNewProject] = useState(false)

  const canCreateProject = role === 'sed' || role === 'manager' || role === 'superadmin'
  const canPay = role === 'manager' || role === 'superadmin'

  const allProjects = data?.projects ?? []
  const paymentProjects = canPay ? allProjects : []
  const handoverProjects = allProjects.filter((p) => p.projectStage === HANDOVER_STAGE)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Forms</h1>
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

        {/* F1 — New Project */}
        {canCreateProject && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">F1 — New Project</p>
              <p className="text-xs text-gray-400 mt-0.5">Start the intake form for a new project</p>
            </div>
            <button
              onClick={() => setShowNewProject(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors shrink-0"
            >
              + New Project
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

        {/* F4 — Payment */}
        {canPay && !isLoading && !error && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">F4 — Payment</p>
            {paymentProjects.length === 0 ? (
              <p className="text-sm text-gray-500">No active projects.</p>
            ) : (
              paymentProjects.map((project) => (
                <div key={project.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <p className="text-sm font-semibold text-gray-900">{project.projectName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {project.clientName ?? '—'} · {project.projectStage ?? '—'}
                  </p>
                  <PaymentForm project={project} />
                </div>
              ))
            )}
          </div>
        )}

        {/* F6 — Handover (Closing stage only, every role) */}
        {!isLoading && !error && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">F6 — Handover</p>
            {handoverProjects.length === 0 ? (
              <p className="text-sm text-gray-500">No projects currently in the Closing stage.</p>
            ) : (
              handoverProjects.map((project) => (
                <div key={project.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <p className="text-sm font-semibold text-gray-900">{project.projectName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {project.clientName ?? '—'} · {project.projectStage ?? '—'}
                  </p>
                  <HandoverSection project={project} onCreated={() => mutate()} />
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreated={() => { setShowNewProject(false); mutate() }}
        />
      )}
    </div>
  )
}
