'use client'

import { useState, Fragment } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { Project, Payment } from '@/lib/types'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { todayUAE } from '@/lib/dateUtils'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

// Contract payment types that carry the project's quotation number + reference.
// Trade/Variance use their own tradeReference; Maintenance stays manual.
const CONTRACT_QUOTATION_TYPES = ['Advance', 'Delivery', 'Material', 'Final', 'Progressive Payment']
const composeQuoteRef = (num?: string, ref?: string) => [num, ref].filter(Boolean).join(' — ')

function PaymentDetail({ project: p }: { project: Project }) {
  const { data, isLoading, mutate } = useSWR<{ project: { payments?: Payment[] } }>(
    `/api/projects/${p.id}`,
    fetcher,
  )
  const payments = data?.project?.payments ?? []

  const today = todayUAE()
  const isTradeOrVariance = p.requestType === 'Trade' || p.requestType === 'Variance'
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    amount: '',
    paymentType: 'Advance',
    paymentStatus: 'Received',
    paymentMethod: 'Bank Transfer',
    referenceNo: isTradeOrVariance
      ? (p.tradeReference ?? '')
      : composeQuoteRef(p.quotationNumber, p.quotationReference),
    quotationNumber: p.quotationNumber ?? '',
    quotationReference: p.quotationReference ?? '',
    receivedDate: today,
    dueDate: '',
    payerType: '',
    payerName: '',
    commission: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [ferr, setFerr] = useState('')

  function setF(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }
  // Editing a quotation field (only when the project has none) live-refreshes referenceNo
  function setQuote(key: 'quotationNumber' | 'quotationReference', value: string) {
    setForm((f) => {
      const next = { ...f, [key]: value }
      if (!isTradeOrVariance && CONTRACT_QUOTATION_TYPES.includes(next.paymentType)) {
        next.referenceNo = composeQuoteRef(next.quotationNumber, next.quotationReference)
      }
      return next
    })
  }

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!form.amount || parseFloat(form.amount) <= 0) { setFerr('Amount is required'); return }
    if (!form.receivedDate) { setFerr('Date is required'); return }
    if (!form.referenceNo.trim()) { setFerr('Reference No. is required'); return }
    if (!form.payerType) { setFerr('Payer Type is required'); return }
    setSaving(true); setFerr(''); setSaved(false)
    try {
      const body: Record<string, unknown> = {
        project: [p.id],
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
      if (!isTradeOrVariance && CONTRACT_QUOTATION_TYPES.includes(form.paymentType)) {
        if (form.quotationNumber.trim()) body.quotationNumber = form.quotationNumber.trim()
        if (form.quotationReference.trim()) body.quotationReference = form.quotationReference.trim()
      }

      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed') }
      setSaved(true)
      setForm({ amount: '', paymentType: 'Advance', paymentStatus: 'Received', paymentMethod: 'Bank Transfer', referenceNo: isTradeOrVariance ? (p.tradeReference ?? '') : composeQuoteRef(p.quotationNumber, p.quotationReference), quotationNumber: p.quotationNumber ?? '', quotationReference: p.quotationReference ?? '', receivedDate: today, dueDate: '', payerType: '', payerName: '', commission: '', notes: '' })
      mutate()
      globalMutate('/api/projects')
      globalMutate('/api/projects?all=true')
    } catch (e) {
      setFerr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'
  const sel = `${inp} bg-white`
  const lbl = 'text-xs text-gray-500 block mb-1'

  if (isLoading) return (
    <div className="py-4 flex justify-center">
      <div className="animate-spin w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="space-y-3">
      {payments.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500">
              <th className="text-left py-1 pr-4">Type</th>
              <th className="text-left py-1 pr-4">Status</th>
              <th className="text-right py-1 pr-4">Amount</th>
              <th className="text-left py-1 pr-4">Method</th>
              <th className="text-left py-1">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {payments.map((pm) => (
              <tr key={pm.id}>
                <td className="py-1.5 pr-4 text-gray-700">{pm.paymentType}</td>
                <td className="py-1.5 pr-4">
                  <Badge
                    variant={pm.paymentStatus === 'Received' ? 'green' : pm.paymentStatus === 'Pending' ? 'orange' : 'gray'}
                    size="sm"
                  >
                    {pm.paymentStatus}
                  </Badge>
                </td>
                <td className="py-1.5 pr-4 text-right font-mono text-gray-800">AED {pm.amount.toLocaleString()}</td>
                <td className="py-1.5 pr-4 text-gray-500">{pm.paymentMethod}</td>
                <td className="py-1.5 text-gray-400">{pm.receivedDate ?? pm.dueDate ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {payments.length === 0 && <p className="text-xs text-gray-400">No payment records yet.</p>}

      <button
        onClick={() => setShowForm(!showForm)}
        className="text-xs text-brand-600 hover:underline font-medium"
      >
        {showForm ? '− Hide form' : '+ Add payment'}
      </button>

      {showForm && (
        <form onSubmit={submitPayment} className="grid grid-cols-2 gap-3 mt-2 p-3 bg-white rounded-lg border border-gray-200">
          {ferr && <p className="col-span-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{ferr}</p>}

          {isTradeOrVariance && (
            <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs">
              <p className="font-semibold text-blue-800 mb-0.5">{p.requestType} Reference</p>
              {p.tradeReference ? (
                <p className="text-blue-700 font-mono">{p.tradeReference}</p>
              ) : (
                <p className="text-orange-600">No trade reference set on this request yet.</p>
              )}
            </div>
          )}
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
            <select
              value={form.paymentType}
              onChange={(e) => {
                const v = e.target.value
                setForm((f) => {
                  let referenceNo = f.referenceNo
                  if (!isTradeOrVariance && CONTRACT_QUOTATION_TYPES.includes(v)) {
                    // Contract payments carry the project's quotation number + reference
                    referenceNo = composeQuoteRef(f.quotationNumber, f.quotationReference)
                  } else {
                    // Trade/Variance keep their tradeReference; others reset
                    referenceNo = isTradeOrVariance ? (p.tradeReference ?? '') : ''
                  }
                  return { ...f, paymentType: v, referenceNo }
                })
              }}
              className={sel}
            >
              {['Advance', 'Delivery', 'Material', 'Final', 'Progressive Payment', 'Trade', 'Variance', 'Maintenance'].map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Status</label>
            <select value={form.paymentStatus} onChange={(e) => setF('paymentStatus', e.target.value)} className={sel}>
              {['Received', 'Pending', 'Overdue'].map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          {!isTradeOrVariance && CONTRACT_QUOTATION_TYPES.includes(form.paymentType) && (
            <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs">
              <p className="font-semibold text-blue-800 mb-1.5">Quotation</p>
              {p.quotationNumber ? (
                <p className="text-blue-700 font-mono">
                  {p.quotationNumber}
                  {p.quotationReference && <span className="ml-2 text-blue-500">{p.quotationReference}</span>}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-blue-800 block mb-0.5">Quotation No.</label>
                    <input type="text" value={form.quotationNumber} onChange={(e) => setQuote('quotationNumber', e.target.value)}
                      className="w-full border border-blue-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="Quotation number" />
                  </div>
                  <div>
                    <label className="text-blue-800 block mb-0.5">Reference</label>
                    <input type="text" value={form.quotationReference} onChange={(e) => setQuote('quotationReference', e.target.value)}
                      className="w-full border border-blue-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="Reference" />
                  </div>
                </div>
              )}
            </div>
          )}
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
            {saved && <span className="text-xs text-green-600">Saved.</span>}
          </div>
        </form>
      )}
    </div>
  )
}

function AllPaymentsView({ projects }: { projects: Project[] }) {
  const { data, isLoading } = useSWR<{ payments: Payment[] }>(
    '/api/payments?all=true',
    fetcher,
    { refreshInterval: 300_000 },
  )
  const payments = data?.payments ?? []

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.projectName]))

  if (isLoading) return (
    <div className="flex justify-center py-12">
      <div className="animate-spin w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full" />
    </div>
  )

  if (payments.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-10">No payment records found.</p>
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-semibold uppercase tracking-wide">
              <th className="text-left px-3 py-2.5">Project</th>
              <th className="text-left px-3 py-2.5">Type</th>
              <th className="text-left px-3 py-2.5">Status</th>
              <th className="text-right px-3 py-2.5">Amount</th>
              <th className="text-left px-3 py-2.5">Method</th>
              <th className="text-left px-3 py-2.5">Ref No.</th>
              <th className="text-left px-3 py-2.5">Payer Type</th>
              <th className="text-left px-3 py-2.5">Payer Name</th>
              <th className="text-left px-3 py-2.5">Date</th>
              <th className="text-left px-3 py-2.5">Due Date</th>
              <th className="text-left px-3 py-2.5">Stage</th>
              <th className="text-left px-3 py-2.5">Commission</th>
              <th className="text-left px-3 py-2.5">Notes</th>
              <th className="text-left px-3 py-2.5">By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {payments.map((pm) => (
              <tr key={pm.id} className={`hover:bg-gray-50 ${pm.paymentStatus === 'Cancelled' ? 'opacity-40 line-through' : ''}`}>
                <td className="px-3 py-2.5 text-gray-700 max-w-[140px] truncate">
                  {(pm.project[0] && projectMap[pm.project[0]]) ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-gray-700">{pm.paymentType}</td>
                <td className="px-3 py-2.5">
                  <Badge
                    variant={pm.paymentStatus === 'Received' ? 'green' : pm.paymentStatus === 'Pending' ? 'orange' : 'gray'}
                    size="sm"
                  >
                    {pm.paymentStatus}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-gray-800 whitespace-nowrap">AED {pm.amount.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-gray-500">{pm.paymentMethod}</td>
                <td className="px-3 py-2.5 font-mono text-gray-500">{pm.referenceNo ?? '—'}</td>
                <td className="px-3 py-2.5 text-gray-500">{pm.payerType ?? '—'}</td>
                <td className="px-3 py-2.5 text-gray-500 max-w-[120px] truncate">{pm.payerName ?? '—'}</td>
                <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{pm.receivedDate ?? '—'}</td>
                <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{pm.dueDate ?? '—'}</td>
                <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{pm.stageAtPayment ?? '—'}</td>
                <td className="px-3 py-2.5 text-gray-500">
                  {pm.commissionAmount != null ? `AED ${pm.commissionAmount.toLocaleString()}` : '—'}
                </td>
                <td className="px-3 py-2.5 text-gray-400 max-w-[160px] truncate" title={pm.notes ?? undefined}>{pm.notes ?? '—'}</td>
                <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{pm.recordedBy ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-400">
        {payments.length} record{payments.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}

interface PaymentTrackerViewProps {
  projects: Project[]
}

export default function PaymentTrackerView({ projects }: PaymentTrackerViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'projects' | 'all'>('projects')

  const totalRevenue = projects.reduce((s, p) => s + (p.projectTotalCost ?? 0), 0)
  const totalPaid = projects.reduce((s, p) => s + (p.totalPaid ?? 0), 0)
  const totalRemaining = projects.reduce((s, p) => s + (p.remainingBalance ?? 0), 0)
  const collectionRate = totalRevenue > 0 ? Math.round((totalPaid / totalRevenue) * 100) : 0

  const sorted = [...projects].sort((a, b) => (b.remainingBalance ?? 0) - (a.remainingBalance ?? 0))

  return (
    <div className="space-y-5">
      {/* View toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setViewMode('projects')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            viewMode === 'projects'
              ? 'bg-brand-600 text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          By Project
        </button>
        <button
          onClick={() => setViewMode('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            viewMode === 'all'
              ? 'bg-brand-600 text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          All Records
        </button>
      </div>

      {viewMode === 'all' && <AllPaymentsView projects={projects} />}

      {viewMode === 'projects' && (<>
      {/* Summary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Contract', value: `AED ${fmt(totalRevenue)}` },
          { label: 'Collected', value: `AED ${fmt(totalPaid)}`, color: 'text-green-600' },
          { label: 'Remaining', value: `AED ${fmt(totalRemaining)}`, color: 'text-red-500' },
          {
            label: 'Collection Rate',
            value: `${collectionRate}%`,
            color: collectionRate >= 70 ? 'text-green-600' : 'text-orange-500',
          },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
            <p className={`text-xl font-bold ${color ?? 'text-gray-900'}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Project table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Project</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Contract</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Paid</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Remaining</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Progress</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map((p) => (
                <Fragment key={p.id}>
                  <tr
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 truncate max-w-[180px]">{p.projectName}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{p.clientName}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-gray-700">
                      {p.projectTotalCost != null ? `AED ${p.projectTotalCost.toLocaleString()}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-green-700">
                      {p.totalPaid != null ? `AED ${p.totalPaid.toLocaleString()}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-red-600">
                      {p.remainingBalance != null ? `AED ${p.remainingBalance.toLocaleString()}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-16">
                          <div
                            className="bg-green-500 h-1.5 rounded-full"
                            style={{ width: `${Math.min(100, p.paymentProgress ?? 0)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 shrink-0">{p.paymentProgress ?? 0}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs text-right">
                      {selectedId === p.id ? '▲' : '▼'}
                    </td>
                  </tr>
                  {selectedId === p.id && (
                    <tr>
                      <td colSpan={7} className="px-4 pb-4 pt-2 bg-gray-50">
                        <PaymentDetail project={p} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-sm text-gray-400">No projects.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>)}
    </div>
  )
}
