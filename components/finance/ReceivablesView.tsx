'use client'

import { useState } from 'react'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Receivable {
  id: string
  clientCompany: string
  invoiceRef: string
  originalAmount: number
  collected: number
  balanceDue: number
  invoiceDate: string
  lastContact: string
  agreedDate: string
  debtAge: number | null
  debtStatus: string
  notes: string
}

const STATUS_COLORS: Record<string, string> = {
  Settled:      'bg-green-100 text-green-700',
  Overdue:      'bg-red-100 text-red-700',
  Partial:      'bg-blue-100 text-blue-700',
  'Written Off':'bg-gray-100 text-gray-500',
}
function statusColor(s: string) {
  return STATUS_COLORS[s] ?? 'bg-amber-100 text-amber-700'
}

function fmt(n: number) {
  return n.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

const EMPTY_FORM = {
  clientCompany: '', invoiceRef: '', originalAmount: '', collected: '',
  invoiceDate: '', lastContact: '', agreedDate: '',
  debtStatus: 'Pending', notes: '',
}

export default function ReceivablesView() {
  const { data, mutate, isLoading } = useSWR<{ receivables: Receivable[] }>('/api/receivables', fetcher, { refreshInterval: 300_000 })
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const receivables = data?.receivables ?? []
  const totalDue = receivables.reduce((sum, r) => sum + r.balanceDue, 0)

  function setField(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await fetch('/api/receivables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientCompany: form.clientCompany,
          invoiceRef: form.invoiceRef || undefined,
          originalAmount: parseFloat(form.originalAmount) || 0,
          collected: form.collected ? parseFloat(form.collected) : undefined,
          invoiceDate: form.invoiceDate || undefined,
          lastContact: form.lastContact || undefined,
          agreedDate: form.agreedDate || undefined,
          debtStatus: form.debtStatus || undefined,
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
    if (!window.confirm('Delete this receivable entry?')) return
    setDeleting(id)
    try {
      await fetch(`/api/receivables/${id}`, { method: 'DELETE' })
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
          <p className="text-xs text-gray-400">Total Balance Due</p>
          <p className="text-xl font-bold text-red-600 mt-0.5">AED {fmt(totalDue)}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
        >
          + Add Receivable
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : receivables.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm py-12 text-center">
          <p className="text-sm text-gray-400">No receivable entries yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Client','Inv Ref','Original','Collected','Balance Due','Age (d)','Inv Date','Last Contact','Agreed Date','Status',''].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {receivables.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2.5 font-medium text-gray-800 whitespace-nowrap max-w-[160px] truncate">{r.clientCompany}</td>
                  <td className="px-3 py-2.5 text-gray-500 font-mono whitespace-nowrap">{r.invoiceRef}</td>
                  <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap text-right">{fmt(r.originalAmount)}</td>
                  <td className="px-3 py-2.5 text-green-700 whitespace-nowrap text-right">{fmt(r.collected)}</td>
                  <td className="px-3 py-2.5 text-red-600 font-semibold whitespace-nowrap text-right">{fmt(r.balanceDue)}</td>
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap text-center">{r.debtAge != null ? r.debtAge : '—'}</td>
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{r.invoiceDate}</td>
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{r.lastContact}</td>
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{r.agreedDate}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusColor(r.debtStatus)}`}>
                      {r.debtStatus}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => handleDelete(r.id)}
                      disabled={deleting === r.id}
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
              <p className="font-semibold text-gray-900 text-sm">Add Receivable</p>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleAdd} className="px-5 py-4 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Client / Company *</span>
                <input required value={form.clientCompany} onChange={(e) => setField('clientCompany', e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Invoice Ref</span>
                  <input value={form.invoiceRef} onChange={(e) => setField('invoiceRef', e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Invoice Date</span>
                  <input type="date" value={form.invoiceDate} onChange={(e) => setField('invoiceDate', e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Original Amount (AED) *</span>
                  <input required type="number" min="0" step="0.01" value={form.originalAmount} onChange={(e) => setField('originalAmount', e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Collected (AED)</span>
                  <input type="number" min="0" step="0.01" value={form.collected} onChange={(e) => setField('collected', e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Last Contact</span>
                  <input type="date" value={form.lastContact} onChange={(e) => setField('lastContact', e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Agreed Date</span>
                  <input type="date" value={form.agreedDate} onChange={(e) => setField('agreedDate', e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400" />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Debt Status</span>
                <select value={form.debtStatus} onChange={(e) => setField('debtStatus', e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
                  {['Pending','Partial','Overdue','Settled','Written Off'].map((s) => <option key={s}>{s}</option>)}
                </select>
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
                  {saving ? 'Saving…' : 'Add Receivable'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
