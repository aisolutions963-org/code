'use client'

import { useState, Fragment } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { Project, Payment } from '@/lib/types'
import { todayUAE } from '@/lib/dateUtils'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import UnifiedCalendar from '@/components/calendar/UnifiedCalendar'
import { fetcher, Spinner, MetricCard, fmt } from './shared'

// Contract payment types that carry the project's quotation number + reference.
// Trade/Variance use their own tradeReference; Maintenance stays manual.
const CONTRACT_QUOTATION_TYPES = ['Advance', 'Delivery', 'Material', 'Final', 'Progressive Payment']
const composeQuoteRef = (num?: string, ref?: string) => [num, ref].filter(Boolean).join(' — ')

function SubBadge({ child }: { child: Project }) {
  const label = child.requestType + (child.tradeReference ? ` · ${child.tradeReference}` : '')
  return (
    <span className="inline-block ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-100 text-teal-700 align-middle">
      {label}
    </span>
  )
}

function PaymentDetail({
  project: p,
  childProjects,
  showForm,
  setShowForm,
}: {
  project: Project
  childProjects: Project[]
  showForm: boolean
  setShowForm: (v: boolean) => void
}) {
  const allIds = [p.id, ...childProjects.map((c) => c.id)].join(',')
  const { data, isLoading, mutate } = useSWR<{ payments: Payment[] }>(
    `/api/payments?projectIds=${allIds}`,
    fetcher,
  )
  const payments = data?.payments ?? []

  const today = todayUAE()
  const isTradeOrVariance = p.requestType === 'Trade' || p.requestType === 'Variance'
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<typeof form | null>(null)
  const [editErr, setEditErr] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [cancelling, setCancelling] = useState<string | null>(null)

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
  function setEF(key: string, value: string) {
    setEditForm((f) => f ? { ...f, [key]: value } : f)
  }

  function startEdit(pm: Payment) {
    setEditingId(pm.id)
    setEditErr('')
    setEditForm({
      amount: pm.amount.toString(),
      paymentType: pm.paymentType,
      paymentStatus: pm.paymentStatus,
      paymentMethod: pm.paymentMethod,
      referenceNo: pm.referenceNo ?? '',
      quotationNumber: p.quotationNumber ?? '',
      quotationReference: p.quotationReference ?? '',
      receivedDate: pm.receivedDate ?? '',
      dueDate: pm.dueDate ?? '',
      payerType: pm.payerType ?? '',
      payerName: pm.payerName ?? '',
      commission: pm.commissionAmount?.toString() ?? '',
      notes: pm.notes ?? '',
    })
    setShowForm(false)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditForm(null)
    setEditErr('')
  }

  async function doVoid(pm: Payment) {
    if (!confirm(`Void this ${pm.paymentType} payment of AED ${pm.amount.toLocaleString()}? This cannot be undone.`)) return
    setCancelling(pm.id)
    try {
      const res = await fetch(`/api/payments/${pm.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentStatus: 'Cancelled' }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setFerr((d as { error?: string }).error ?? 'Failed to void payment') }
      else { mutate(); globalMutate('/api/projects?all=true') }
    } catch { setFerr('Failed to void payment') }
    finally { setCancelling(null) }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingId || !editForm) return
    if (!editForm.amount || parseFloat(editForm.amount) <= 0) { setEditErr('Amount is required'); return }
    setEditSaving(true); setEditErr('')
    try {
      const body: Record<string, unknown> = {
        amount: parseFloat(editForm.amount),
        paymentType: editForm.paymentType,
        paymentStatus: editForm.paymentStatus,
        paymentMethod: editForm.paymentMethod,
      }
      if (editForm.referenceNo.trim()) body.referenceNo = editForm.referenceNo.trim()
      if (editForm.receivedDate) body.receivedDate = editForm.receivedDate
      if (editForm.dueDate) body.dueDate = editForm.dueDate
      if (editForm.payerType) body.payerType = editForm.payerType
      if (editForm.payerName.trim()) body.payerName = editForm.payerName.trim()
      if (editForm.payerType === 'Broker' && editForm.commission) body.commissionAmount = parseFloat(editForm.commission)
      if (editForm.notes.trim()) body.notes = editForm.notes.trim()
      const res = await fetch(`/api/payments/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setEditErr((d as { error?: string }).error ?? 'Failed to update') }
      else { cancelEdit(); mutate(); globalMutate('/api/projects?all=true') }
    } catch { setEditErr('Failed to update payment') }
    finally { setEditSaving(false) }
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
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed')
      }
      setSaved(true)
      setForm({ amount: '', paymentType: 'Advance', paymentStatus: 'Received', paymentMethod: 'Bank Transfer', referenceNo: isTradeOrVariance ? (p.tradeReference ?? '') : composeQuoteRef(p.quotationNumber, p.quotationReference), quotationNumber: p.quotationNumber ?? '', quotationReference: p.quotationReference ?? '', receivedDate: today, dueDate: '', payerType: '', payerName: '', commission: '', notes: '' })
      mutate()
      globalMutate('/api/projects?all=true')
    } catch (e) {
      setFerr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <div className="py-4"><Spinner /></div>

  return (
    <div className="space-y-3">
      {ferr && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{ferr}</p>}
      {payments.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[900px]">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100">
                <th className="text-left py-1.5 pr-3 font-medium">Type</th>
                <th className="text-left py-1.5 pr-3 font-medium">Status</th>
                <th className="text-right py-1.5 pr-3 font-medium">Amount</th>
                <th className="text-left py-1.5 pr-3 font-medium">Method</th>
                <th className="text-left py-1.5 pr-3 font-medium">Ref No</th>
                <th className="text-left py-1.5 pr-3 font-medium">Payer Type</th>
                <th className="text-left py-1.5 pr-3 font-medium">Payer Name</th>
                <th className="text-left py-1.5 pr-3 font-medium">Recorded By</th>
                <th className="text-left py-1.5 pr-3 font-medium">Date</th>
                <th className="text-left py-1.5 pr-3 font-medium">Stage</th>
                <th className="text-right py-1.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map((pm) => {
                const sourceChild = childProjects.find((c) => pm.project.includes(c.id))
                return (
                  <Fragment key={pm.id}>
                    <tr className={pm.paymentStatus === 'Cancelled' ? 'opacity-50 line-through' : ''}>
                      <td className="py-1.5 pr-3 text-gray-700 whitespace-nowrap">
                        {pm.paymentType}
                        {sourceChild && <SubBadge child={sourceChild} />}
                      </td>
                      <td className="py-1.5 pr-3">
                        <Badge variant={pm.paymentStatus === 'Received' ? 'green' : pm.paymentStatus === 'Pending' ? 'orange' : 'gray'} size="sm">
                          {pm.paymentStatus}
                        </Badge>
                      </td>
                      <td className="py-1.5 pr-3 text-right font-mono text-gray-800 whitespace-nowrap">AED {pm.amount.toLocaleString()}</td>
                      <td className="py-1.5 pr-3 text-gray-500">{pm.paymentMethod}</td>
                      <td className="py-1.5 pr-3 text-gray-600 font-mono">{pm.referenceNo ?? '—'}</td>
                      <td className="py-1.5 pr-3 text-gray-500">{pm.payerType ?? '—'}</td>
                      <td className="py-1.5 pr-3 text-gray-500">{pm.payerName ?? '—'}</td>
                      <td className="py-1.5 pr-3 text-gray-400">{pm.recordedBy ?? '—'}</td>
                      <td className="py-1.5 pr-3 text-gray-400 whitespace-nowrap">{pm.receivedDate ?? pm.dueDate ?? '—'}</td>
                      <td className="py-1.5 pr-3 text-gray-400 whitespace-nowrap">{pm.stageAtPayment ?? '—'}</td>
                      <td className="py-1.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => editingId === pm.id ? cancelEdit() : startEdit(pm)}
                          className="text-xs text-blue-600 hover:underline mr-2"
                        >
                          {editingId === pm.id ? 'Discard' : 'Edit'}
                        </button>
                        {pm.paymentStatus !== 'Cancelled' && (
                          <button
                            onClick={() => doVoid(pm)}
                            disabled={cancelling === pm.id}
                            className="text-xs text-red-500 hover:underline disabled:opacity-50"
                          >
                            {cancelling === pm.id ? '…' : 'Void'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {editingId === pm.id && editForm && (
                      <tr>
                        <td colSpan={11} className="pb-3 pt-1 bg-blue-50/50">
                          <form onSubmit={submitEdit} className="grid grid-cols-2 gap-3 p-3 bg-white rounded-lg border border-blue-200">
                            {editErr && <p className="col-span-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{editErr}</p>}
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Date</label>
                              <input type="date" value={editForm.receivedDate} onChange={(e) => setEF('receivedDate', e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Amount (AED) *</label>
                              <input type="number" min="0" step="0.01" value={editForm.amount} onChange={(e) => setEF('amount', e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Type</label>
                              <select value={editForm.paymentType} onChange={(e) => setEF('paymentType', e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                                {['Advance', 'Delivery', 'Material', 'Final', 'Progressive Payment', 'Trade', 'Variance', 'Maintenance'].map((v) => <option key={v}>{v}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Status</label>
                              <select value={editForm.paymentStatus} onChange={(e) => setEF('paymentStatus', e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                                {['Received', 'Pending', 'Overdue', 'Cancelled'].map((v) => <option key={v}>{v}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Method</label>
                              <select value={editForm.paymentMethod} onChange={(e) => setEF('paymentMethod', e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                                {['Bank Transfer', 'Cash', 'Cheque'].map((v) => <option key={v}>{v}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Reference No.</label>
                              <input type="text" value={editForm.referenceNo} onChange={(e) => setEF('referenceNo', e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Payer Type</label>
                              <select value={editForm.payerType} onChange={(e) => setEF('payerType', e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                                <option value="">— select —</option>
                                {['Broker', 'Contractor', 'End User', 'Designer'].map((v) => <option key={v}>{v}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Payer Name</label>
                              <input type="text" value={editForm.payerName} onChange={(e) => setEF('payerName', e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                            </div>
                            {editForm.payerType === 'Broker' && (
                              <div className="col-span-2">
                                <label className="text-xs text-gray-500 block mb-1">Commission Amount (AED)</label>
                                <input type="number" min="0" step="0.01" value={editForm.commission} onChange={(e) => setEF('commission', e.target.value)}
                                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                              </div>
                            )}
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Due Date</label>
                              <input type="date" value={editForm.dueDate} onChange={(e) => setEF('dueDate', e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Notes</label>
                              <input type="text" value={editForm.notes} onChange={(e) => setEF('notes', e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                            </div>
                            <div className="col-span-2 flex items-center gap-3">
                              <Button type="submit" size="sm" loading={editSaving}>Update Payment</Button>
                              <button type="button" onClick={cancelEdit} className="text-xs text-gray-500 hover:underline">Discard</button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {payments.length === 0 && <p className="text-xs text-gray-400">No payment records.</p>}

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
            <label className="text-xs text-gray-500 block mb-1">Date *</label>
            <input type="date" value={form.receivedDate} onChange={(e) => setF('receivedDate', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Amount (AED) *</label>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setF('amount', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="0.00" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Type *</label>
            <select value={form.paymentType} onChange={(e) => {
                const v = e.target.value
                setForm((f) => {
                  let referenceNo = f.referenceNo
                  if (!isTradeOrVariance && CONTRACT_QUOTATION_TYPES.includes(v)) {
                    referenceNo = composeQuoteRef(f.quotationNumber, f.quotationReference)
                  } else {
                    referenceNo = isTradeOrVariance ? (p.tradeReference ?? '') : ''
                  }
                  return { ...f, paymentType: v, referenceNo }
                })
              }}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              {['Advance', 'Delivery', 'Material', 'Final', 'Progressive Payment', 'Trade', 'Variance', 'Maintenance'].map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Status *</label>
            <select value={form.paymentStatus} onChange={(e) => setF('paymentStatus', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              {['Received', 'Pending', 'Overdue'].map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Method *</label>
            <select value={form.paymentMethod} onChange={(e) => setF('paymentMethod', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              {['Bank Transfer', 'Cash', 'Cheque'].map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Reference No. *</label>
            <input type="text" value={form.referenceNo} onChange={(e) => setF('referenceNo', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="TRN / cheque no." />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Payer Type *</label>
            <select value={form.payerType} onChange={(e) => setF('payerType', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">— select —</option>
              {['Broker', 'Contractor', 'End User', 'Designer'].map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Payer Name</label>
            <input type="text" value={form.payerName} onChange={(e) => setF('payerName', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="Full name" />
          </div>
          {form.payerType === 'Broker' && (
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Commission Amount (AED)</label>
              <input type="number" min="0" step="0.01" value={form.commission} onChange={(e) => setF('commission', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="0.00" />
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500 block mb-1">Due Date</label>
            <input type="date" value={form.dueDate} onChange={(e) => setF('dueDate', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Notes</label>
            <input type="text" value={form.notes} onChange={(e) => setF('notes', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="Optional" />
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

export default function PaymentsPage() {
  const { data, isLoading } = useSWR<{ projects: Project[] }>(
    '/api/projects?all=true', fetcher, { refreshInterval: 300_000 },
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const projects = data?.projects ?? []
  const sorted = [...projects].sort((a, b) => (b.remainingBalance ?? 0) - (a.remainingBalance ?? 0))

  const totalRevenue = projects.reduce((s, p) => s + (p.projectTotalCost ?? 0), 0)
  const totalPaid = projects.reduce((s, p) => s + (p.totalPaid ?? 0), 0)
  const totalRemaining = projects.reduce((s, p) => s + (p.remainingBalance ?? 0), 0)
  const collectionRate = totalRevenue > 0 ? Math.round((totalPaid / totalRevenue) * 100) : 0

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Payment Tracker</h2>
        <p className="text-sm text-gray-500">Portfolio-wide payment status</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Total Contract" value={`AED ${fmt(totalRevenue)}`} />
        <MetricCard label="Collected" value={`AED ${fmt(totalPaid)}`} color="text-green-600" />
        <MetricCard label="Remaining" value={`AED ${fmt(totalRemaining)}`} color="text-red-500" />
        <MetricCard label="Collection Rate" value={`${collectionRate}%`} color={collectionRate >= 70 ? 'text-green-600' : 'text-orange-500'} />
      </div>

      <UnifiedCalendar filterTypes={['payment-received', 'payment-due']} />

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
              {sorted.map((p) => {
                const childProjects = projects.filter(
                  (proj) => proj.parentProjectId === p.id && !!proj.requestType,
                )
                return (
                  <Fragment key={p.id}>
                    <tr
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => {
                        setSelectedId(selectedId === p.id ? null : p.id)
                        setShowForm(false)
                      }}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900 truncate max-w-[180px]">
                        {p.projectName}
                        {p.requestType && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-100 text-teal-700">
                            {p.requestType}
                          </span>
                        )}
                      </td>
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
                          {childProjects.length > 0 && (
                            <p className="text-[10px] text-gray-400 mb-2">
                              Includes payments from {childProjects.length} sub-project{childProjects.length > 1 ? 's' : ''}{' '}
                              ({childProjects.map((c) => `${c.requestType}${c.tradeReference ? ` · ${c.tradeReference}` : ''}`).join(', ')})
                            </p>
                          )}
                          <PaymentDetail project={p} childProjects={childProjects} showForm={showForm} setShowForm={setShowForm} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-sm text-gray-400">No projects.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
