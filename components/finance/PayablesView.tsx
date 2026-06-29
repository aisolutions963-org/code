'use client'

import { useState } from 'react'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Payable {
  id: string
  payableTo: string
  category: string
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  totalAmount: number
  amountPaid: number
  amountPayable: number
  paymentStatus: string
  approvedBy: string
  notes: string
}

const STATUS_COLORS: Record<string, string> = {
  Paid:     'bg-green-100 text-green-700',
  Overdue:  'bg-red-100 text-red-700',
  'On Hold':'bg-gray-100 text-gray-500',
}
function statusColor(s: string) {
  return STATUS_COLORS[s] ?? 'bg-amber-100 text-amber-700'
}

function fmt(n: number) {
  return n.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

const EMPTY_FORM = {
  payableTo: '', category: '', invoiceNumber: '', invoiceDate: '',
  dueDate: '', totalAmount: '', amountPaid: '', paymentStatus: 'Pending',
  approvedBy: '', notes: '',
}

export default function PayablesView() {
  const { data, mutate, isLoading } = useSWR<{ payables: Payable[] }>('/api/payables', fetcher, { refreshInterval: 300_000 })
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const payables = data?.payables ?? []
  const totalOutstanding = payables
    .filter((p) => p.paymentStatus !== 'Paid')
    .reduce((sum, p) => sum + p.amountPayable, 0)

  function setField(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await fetch('/api/payables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payableTo: form.payableTo,
          category: form.category || undefined,
          invoiceNumber: form.invoiceNumber || undefined,
          invoiceDate: form.invoiceDate || undefined,
          dueDate: form.dueDate || undefined,
          totalAmount: parseFloat(form.totalAmount) || 0,
          amountPaid: form.amountPaid ? parseFloat(form.amountPaid) : undefined,
          paymentStatus: form.paymentStatus,
          approvedBy: form.approvedBy || undefined,
          notes: form.notes || undefined,
        }),
      })
      mutate()
      setShowAdd(false)
      setForm(EMPTY_FORM)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this payable entry?')) return
    setDeleting(id)
    try {
      await fetch(`/api/payables/${id}`, { method: 'DELETE' })
      mutate()
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary + Add button */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
          <p className="text-xs text-gray-400">Outstanding Payable</p>
          <p className="text-xl font-bold text-red-600 mt-0.5">AED {fmt(totalOutstanding)}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
        >
          + Add Payable
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : payables.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm py-12 text-center">
          <p className="text-sm text-gray-400">No payable entries yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Payable To','Category','Inv #','Inv Date','Due Date','Total','Paid','Payable','Status','Approved By',''].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {payables.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2.5 font-medium text-gray-800 whitespace-nowrap max-w-[160px] truncate">{p.payableTo}</td>
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{p.category}</td>
                  <td className="px-3 py-2.5 text-gray-500 font-mono whitespace-nowrap">{p.invoiceNumber}</td>
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{p.invoiceDate}</td>
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{p.dueDate}</td>
                  <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap text-right">{fmt(p.totalAmount)}</td>
                  <td className="px-3 py-2.5 text-green-700 whitespace-nowrap text-right">{fmt(p.amountPaid)}</td>
                  <td className="px-3 py-2.5 text-red-600 font-semibold whitespace-nowrap text-right">{fmt(p.amountPayable)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusColor(p.paymentStatus)}`}>
                      {p.paymentStatus}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{p.approvedBy}</td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={deleting === p.id}
                      className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40 text-base leading-none"
                      title="Delete"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <p className="font-semibold text-gray-900 text-sm">Add Payable</p>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleAdd} className="px-5 py-4 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Payable To *</span>
                <input required value={form.payableTo} onChange={(e) => setField('payableTo', e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Category</span>
                  <input value={form.category} onChange={(e) => setField('category', e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Invoice #</span>
                  <input value={form.invoiceNumber} onChange={(e) => setField('invoiceNumber', e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Invoice Date</span>
                  <input type="date" value={form.invoiceDate} onChange={(e) => setField('invoiceDate', e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Due Date</span>
                  <input type="date" value={form.dueDate} onChange={(e) => setField('dueDate', e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Total Amount (AED) *</span>
                  <input required type="number" min="0" step="0.01" value={form.totalAmount} onChange={(e) => setField('totalAmount', e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Amount Paid (AED)</span>
                  <input type="number" min="0" step="0.01" value={form.amountPaid} onChange={(e) => setField('amountPaid', e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400" />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Payment Status</span>
                <select value={form.paymentStatus} onChange={(e) => setField('paymentStatus', e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
                  {['Pending','Paid','Overdue','On Hold'].map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Approved By</span>
                <input value={form.approvedBy} onChange={(e) => setField('approvedBy', e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Notes</span>
                <textarea rows={2} value={form.notes} onChange={(e) => setField('notes', e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none" />
              </label>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="flex-1 py-2 text-sm rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors">
                  {saving ? 'Saving…' : 'Add Payable'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
