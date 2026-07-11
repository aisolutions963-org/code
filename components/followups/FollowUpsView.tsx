'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Button from '@/components/ui/Button'

interface FollowUpLog {
  id: string
  quotationId: string
  quotationNumber: string
  quotationReference?: string
  clientName: string
  date: string
  method: string
  outcome: string
  nextDate?: string
  doneBy: string
  notes?: string
}

interface QuotationOption {
  id: string
  quoteNumber: string
  quotationReference?: string
  clientName: string
  projectName?: string
}

const METHOD_COLORS: Record<string, string> = {
  'Phone Call': 'bg-blue-100 text-blue-700',
  WhatsApp:     'bg-green-100 text-green-700',
  Email:        'bg-purple-100 text-purple-700',
  'In Person':  'bg-amber-100 text-amber-700',
}
function methodColor(m: string) {
  return METHOD_COLORS[m] ?? 'bg-gray-100 text-gray-500'
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const EMPTY_FORM = {
  quotationId: '',
  date: new Date().toISOString().slice(0, 10),
  method: 'Phone Call',
  outcome: '',
  nextDate: '',
  notes: '',
}

export default function FollowUpsView({ title = 'Follow-Ups', editable = false }: { title?: string; editable?: boolean }) {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const { data, mutate, isLoading } = useSWR<{ logs: FollowUpLog[]; quotations: QuotationOption[] }>(
    '/api/follow-ups',
    fetcher,
    { refreshInterval: 300_000 },
  )
  const logs = data?.logs ?? []
  const quotations = data?.quotations ?? []

  function setField(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await fetch('/api/follow-ups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quotationId: form.quotationId || undefined,
          date: form.date,
          method: form.method,
          outcome: form.outcome,
          nextDate: form.nextDate || undefined,
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
    if (!window.confirm('Delete this follow-up?')) return
    setDeleting(id)
    try {
      await fetch(`/api/follow-ups/${id}`, { method: 'DELETE' })
      mutate()
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{logs.length} log{logs.length !== 1 ? 's' : ''}</p>
        </div>
        {editable && <Button size="sm" onClick={() => setShowAdd(true)}>+ Log Follow-Up</Button>}
      </div>

      {isLoading && (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && logs.length === 0 && (
        <p className="text-center py-10 text-sm text-gray-400">No follow-ups logged yet.</p>
      )}

      {!isLoading && logs.length > 0 && (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-semibold text-gray-800 truncate">
                      {log.clientName || log.quotationNumber || '—'}
                    </span>
                    {log.quotationNumber && (
                      <span className="font-mono text-[11px] text-gray-400">
                        {log.quotationNumber}{log.quotationReference ?? ''}
                      </span>
                    )}
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${methodColor(log.method)}`}>
                      {log.method}
                    </span>
                  </div>
                  <p className="text-xs text-gray-700">{log.outcome}</p>
                  {log.notes && <p className="text-[11px] text-gray-400 mt-0.5 italic">{log.notes}</p>}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-[11px] text-gray-400">
                      {log.date
                        ? new Date(log.date + 'T00:00:00').toLocaleDateString('en-AE', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : ''}
                    </span>
                    {log.nextDate && (
                      <span className="text-[11px] text-brand-600 font-medium">
                        Next:{' '}
                        {new Date(log.nextDate + 'T00:00:00').toLocaleDateString('en-AE', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    )}
                    {log.doneBy && (
                      <span className="text-[11px] text-gray-400">by {log.doneBy}</span>
                    )}
                  </div>
                </div>
                {editable && (
                  <button
                    onClick={() => handleDelete(log.id)}
                    disabled={deleting === log.id}
                    className="shrink-0 text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40 text-base leading-none mt-0.5"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <p className="font-semibold text-gray-900 text-sm">Log Follow-Up</p>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleAdd} className="px-5 py-4 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Project / Quotation</span>
                <select
                  value={form.quotationId}
                  onChange={(e) => setField('quotationId', e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                >
                  <option value="">— None —</option>
                  {quotations.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.quoteNumber
                        ? `${q.quoteNumber}${q.quotationReference ?? ''} — `
                        : ''}
                      {q.projectName || q.clientName || 'Unnamed project'}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Date *</span>
                  <input
                    required
                    type="date"
                    value={form.date}
                    onChange={(e) => setField('date', e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Method *</span>
                  <select
                    required
                    value={form.method}
                    onChange={(e) => setField('method', e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                  >
                    {['Phone Call', 'WhatsApp', 'Email', 'In Person', 'Other'].map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Outcome *</span>
                <select
                  required
                  value={form.outcome}
                  onChange={(e) => setField('outcome', e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                >
                  <option value="">— select outcome —</option>
                  {['Contacted Client', 'Scheduled Follow-Up', 'Sent Proposal', 'Escalated to Manager', 'Project Cancelled', 'No Action Needed', 'No Answer'].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Next Follow-Up Date</span>
                <input
                  type="date"
                  value={form.nextDate}
                  onChange={(e) => setField('nextDate', e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Notes</span>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setField('notes', e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
                />
              </label>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="flex-1 py-2 text-sm rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving…' : 'Log Follow-Up'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
