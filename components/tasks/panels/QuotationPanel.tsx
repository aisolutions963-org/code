'use client'

import { useState } from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { todayUAE } from '@/lib/dateUtils'
import { Task, TaskUpdateInput, Payment } from '@/lib/types'

interface QuotationPanelProps {
  task: Task
  variant: 'makeQuotation' | 'f4'
  onUpdate: (id: string, fields: Partial<TaskUpdateInput>) => Promise<void>
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const today = todayUAE()

const inp = 'w-full border border-blue-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white'
const sel = 'w-full border border-blue-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white'
const lbl = 'text-xs text-gray-500 block mb-1'

export default function QuotationPanel({ task, variant, onUpdate }: QuotationPanelProps) {
  const [quotationInput, setQuotationInput] = useState(task.projectQuotationNumber ?? '')
  const [referenceInput, setReferenceInput] = useState(task.projectQuotationReference ?? '')
  const [quotationError, setQuotationError] = useState('')
  const [saving, setSaving] = useState(false)

  // F4 payment form state
  const [amount, setAmount] = useState('')
  const isClientRequest = !!(task.projectRequestType)
  const [paymentType, setPaymentType] = useState(() => {
    if (task.projectRequestType === 'Trade') return 'Trade'
    if (task.projectRequestType === 'Variance') return 'Variance'
    if (task.projectRequestType === 'Maintenance') return 'Maintenance'
    const name = task.taskName.toLowerCase()
    if (name.includes('delivery')) return 'Delivery'
    if (name.includes('final')) return 'Final'
    return 'Advance'
  })
  const [paymentStatus, setPaymentStatus] = useState('Received')
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer')
  const [referenceNo, setReferenceNo] = useState('')
  const [receivedDate, setReceivedDate] = useState(today)
  const [payerType, setPayerType] = useState('')
  const [payerName, setPayerName] = useState('')
  const [commission, setCommission] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')

  const projectId = task.projectRecordId ?? task.project?.[0] ?? ''
  const isFinalPaymentTask = task.taskName.toLowerCase().includes('final')

  const { data: paymentsData } = useSWR<{ payments: Payment[] }>(
    // For Final-payment tasks we also fetch while still open, to detect a Final payment that
    // was already recorded elsewhere (Payment Tracker) and offer a plain "Mark Complete".
    variant === 'f4' && projectId && (task.status === 'Completed' || isFinalPaymentTask)
      ? `/api/payments?projectId=${projectId}`
      : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const payments = paymentsData?.payments ?? []
  const existingFinalPayment = isFinalPaymentTask
    ? payments.find((p) => p.paymentType === 'Final' && p.paymentStatus !== 'Cancelled')
    : undefined

  async function patchProjectQuotation(qn: string, ref: string): Promise<void> {
    if (!projectId) throw new Error('No project linked to this task')
    const patchBody: Record<string, string> = { quotationNumber: qn }
    if (ref) patchBody.quotationReference = ref
    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patchBody),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error((d as { error?: string }).error ?? 'Failed to save quotation')
    }
  }

  // ── makeQuotation handlers ──────────────────────────────────────────────
  async function saveAndComplete() {
    const newQN = quotationInput.trim()
    const newRef = referenceInput.trim()
    if (!newQN) { setQuotationError('Quotation number is required'); return }
    if (!newRef) { setQuotationError('Quotation reference is required'); return }
    setSaving(true)
    setQuotationError('')
    try {
      await patchProjectQuotation(newQN, newRef)
      await onUpdate(task.id, { status: 'Completed' } as Partial<TaskUpdateInput>)
      toast.success('Saved')
    } catch (e) {
      setQuotationError(e instanceof Error ? e.message : 'Failed')
      toast.error('Failed')
    } finally {
      setSaving(false)
    }
  }

  async function saveQuotationOnly() {
    if (!quotationInput.trim()) { setQuotationError('Quotation number is required'); return }
    if (!referenceInput.trim()) { setQuotationError('Quotation reference is required'); return }
    setSaving(true)
    setQuotationError('')
    try {
      await patchProjectQuotation(quotationInput.trim(), referenceInput.trim())
      toast.success('Quotation saved')
      await onUpdate(task.id, {})
    } catch (e) {
      setQuotationError(e instanceof Error ? e.message : 'Failed')
      toast.error('Failed')
    } finally {
      setSaving(false)
    }
  }

  // ── F4 handler ──────────────────────────────────────────────────────────
  async function recordPaymentAndComplete() {
    setFormError('')
    const amountNum = parseFloat(amount)
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setFormError('Enter a valid amount'); return
    }
    if (!receivedDate) { setFormError('Received date is required'); return }
    if (!payerType) { setFormError('Payer type is required'); return }
    if (!projectId) { setFormError('No project linked to this task'); return }

    const alreadyHasQN = !!task.projectQuotationNumber?.trim()
    const alreadyHasRef = !!task.projectQuotationReference?.trim()
    if (!isClientRequest) {
      if (!alreadyHasQN && !quotationInput.trim()) {
        setFormError('Quotation number is required before recording payment'); return
      }
      if (!alreadyHasRef && !referenceInput.trim()) {
        setFormError('Quotation reference is required before recording payment'); return
      }
    }

    setSaving(true)
    try {
      const qn = quotationInput.trim()
      const ref = referenceInput.trim()
      // client requests (Trade/Variance/Maintenance) already have their reference stored on the
      // sub-project record — no need to patch the parent project's quotation fields
      const needsPatch = !isClientRequest && ((!alreadyHasQN && qn) || (!alreadyHasRef && ref))
      if (needsPatch) {
        await patchProjectQuotation(alreadyHasQN ? (task.projectQuotationNumber ?? '') : qn, ref)
      }

      const body: Record<string, unknown> = {
        project: [projectId],
        amount: amountNum,
        paymentType,
        paymentStatus,
        paymentMethod,
        receivedDate,
        payerType,
      }
      if (referenceNo.trim()) body.referenceNo = referenceNo.trim()
      if (payerName.trim()) body.payerName = payerName.trim()
      if (payerType === 'Broker' && commission) body.commissionAmount = parseFloat(commission)
      if (notes.trim()) body.notes = notes.trim()

      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? 'Failed to record payment')
      }

      await onUpdate(task.id, { status: 'Completed' } as Partial<TaskUpdateInput>)
      toast.success('Payment recorded')
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed')
      toast.error(e instanceof Error ? e.message : 'Failed to record payment')
    } finally {
      setSaving(false)
    }
  }

  // ── makeQuotation variant ───────────────────────────────────────────────
  if (variant === 'makeQuotation') {
    return (
      <>
        {(task.status !== 'Completed' ||
          (!task.projectQuotationNumber && !task.projectQuotationReference)) && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-3 space-y-2">
            <p className="text-xs font-semibold text-amber-800">
              Quotation Number
              {task.status !== 'Completed' && <span className="text-red-500 ml-0.5">*</span>}
              <span className="ml-1 font-normal text-amber-600">
                {task.status === 'Completed'
                  ? '— task complete, save to record'
                  : '— required to complete this task'}
              </span>
            </p>
            <input
              className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
              placeholder="e.g. 2341"
              value={quotationInput}
              onChange={(e) => { setQuotationInput(e.target.value); setQuotationError('') }}
            />
            <p className="text-xs font-semibold text-amber-800">
              Reference Number <span className="text-red-500">*</span>
              <span className="ml-1 font-normal text-amber-600">— official project reference</span>
            </p>
            <input
              className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white font-mono"
              placeholder="e.g. R0, R1…"
              value={referenceInput}
              onChange={(e) => setReferenceInput(e.target.value)}
            />
            {quotationError && <p className="text-xs text-red-600">{quotationError}</p>}
            <div className="flex justify-end pt-1">
              {task.status === 'Completed' ? (
                <button
                  onClick={saveQuotationOnly}
                  disabled={saving}
                  className="px-4 py-1.5 text-xs rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save Quotation'}
                </button>
              ) : (
                <button
                  onClick={saveAndComplete}
                  disabled={saving || !quotationInput.trim() || !referenceInput.trim()}
                  className="px-4 py-1.5 text-xs rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save & Complete'}
                </button>
              )}
            </div>
          </div>
        )}
        {task.status === 'Completed' &&
          (task.projectQuotationNumber || task.projectQuotationReference) && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-3 space-y-1">
              <p className="text-xs font-semibold text-green-800">Quotation Saved</p>
              {task.projectQuotationNumber && (
                <p className="text-xs text-green-700">
                  Number:{' '}
                  <span className="font-mono font-medium">{task.projectQuotationNumber}</span>
                </p>
              )}
              {task.projectQuotationReference && (
                <p className="text-xs text-green-700">
                  Reference:{' '}
                  <span className="font-mono font-medium">{task.projectQuotationReference}</span>
                </p>
              )}
            </div>
          )}
      </>
    )
  }

  // ── F4 variant — completed state ────────────────────────────────────────
  if (task.status === 'Completed') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-3 space-y-2">
        <p className="text-xs font-semibold text-green-800">✓ Payment Recorded</p>
        {task.projectQuotationNumber && (
          <p className="text-xs text-green-700">
            Quotation:{' '}
            <span className="font-mono font-medium">{task.projectQuotationNumber}</span>
            {task.projectQuotationReference && (
              <span className="ml-2 font-mono text-green-500">{task.projectQuotationReference}</span>
            )}
          </p>
        )}
        {payments.map((pm) => (
          <div key={pm.id} className="bg-white border border-green-200 rounded-lg px-3 py-2 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-800">AED {pm.amount.toLocaleString()}</span>
              <span className="text-gray-500">{pm.paymentType} · {pm.paymentStatus}</span>
            </div>
            <div className="text-gray-600 flex flex-wrap gap-x-3 gap-y-0.5">
              <span>{pm.paymentMethod}</span>
              {pm.receivedDate && <span>{pm.receivedDate}</span>}
              {pm.referenceNo && <span className="font-mono">{pm.referenceNo}</span>}
              {pm.payerType && (
                <span>{pm.payerType}{pm.payerName ? ` — ${pm.payerName}` : ''}</span>
              )}
              {pm.commissionAmount != null && (
                <span>Commission: AED {pm.commissionAmount.toLocaleString()}</span>
              )}
            </div>
            {pm.notes && <p className="text-gray-500 italic">{pm.notes}</p>}
            {pm.recordedBy && <p className="text-gray-400">Recorded by {pm.recordedBy}</p>}
          </div>
        ))}
      </div>
    )
  }

  // Final payment already recorded elsewhere (e.g. Payment Tracker) — offer a plain complete
  // instead of the record form, so the task isn't stranded by the duplicate-Final guard.
  if (isFinalPaymentTask && existingFinalPayment) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-3 space-y-2">
        <p className="text-xs font-semibold text-blue-800">Final payment already recorded</p>
        <p className="text-xs text-blue-700">
          AED {existingFinalPayment.amount.toLocaleString()} · {existingFinalPayment.paymentMethod}
          {existingFinalPayment.receivedDate ? ` · ${existingFinalPayment.receivedDate}` : ''}
        </p>
        <button
          onClick={async () => {
            setSaving(true)
            try {
              await onUpdate(task.id, { status: 'Completed' } as Partial<TaskUpdateInput>)
              toast.success('Completed')
            } catch {
              toast.error('Failed to complete')
            } finally {
              setSaving(false)
            }
          }}
          disabled={saving}
          className="w-full py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving…' : '✓ Mark Complete'}
        </button>
      </div>
    )
  }

  // ── F4 variant — form ───────────────────────────────────────────────────
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-3 space-y-3">
      <p className="text-xs font-semibold text-blue-800">Record Payment</p>

      {/* Quotation / reference context */}
      {isClientRequest ? (
        <div className="bg-blue-100 border border-blue-200 rounded-lg px-3 py-2 text-xs flex flex-wrap gap-x-4 gap-y-1">
          {task.projectQuotationNumber && (
            <span>
              <span className="font-semibold text-blue-800">Quotation: </span>
              <span className="font-mono text-blue-700">{task.projectQuotationNumber}</span>
            </span>
          )}
          {task.projectTradeReference && (
            <span>
              <span className="font-semibold text-blue-800">{task.projectRequestType} Ref: </span>
              <span className="font-mono text-blue-700">{task.projectTradeReference}</span>
            </span>
          )}
        </div>
      ) : (
        <div>
          <label className={lbl}>Quotation Number &amp; Reference</label>
          {/* If the project already has them, show read-only (set upstream via Make Quotation / F2).
              If not, capture them here — they're saved to the project on submit. */}
          {task.projectQuotationNumber ? (
            <p className="text-sm font-mono font-medium text-blue-700 py-1">
              {task.projectQuotationNumber}
              {task.projectQuotationReference && (
                <span className="ml-2 font-normal text-blue-400">{task.projectQuotationReference}</span>
              )}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Quotation No. <span className="text-red-500">*</span></label>
                <input
                  className={inp}
                  placeholder="e.g. 2341"
                  value={quotationInput}
                  onChange={(e) => { setQuotationInput(e.target.value); setFormError('') }}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Reference <span className="text-red-500">*</span></label>
                <input
                  className={inp + ' font-mono'}
                  placeholder="e.g. R0, R1…"
                  value={referenceInput}
                  onChange={(e) => { setReferenceInput(e.target.value); setFormError('') }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Amount + Date */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={lbl}>Amount (AED) <span className="text-red-500">*</span></label>
          <input
            type="number"
            min="0"
            step="0.01"
            className={inp}
            placeholder="0.00"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setFormError('') }}
          />
        </div>
        <div>
          <label className={lbl}>Received Date <span className="text-red-500">*</span></label>
          <input
            type="date"
            className={inp}
            value={receivedDate}
            onChange={(e) => setReceivedDate(e.target.value)}
          />
        </div>
      </div>

      {/* Payment Type + Method */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={lbl}>Payment Type</label>
          <select className={sel} value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
            <option>Advance</option>
            <option>Delivery</option>
            <option>Material</option>
            <option>Progressive Payment</option>
            <option>Final</option>
            <option>Trade</option>
            <option>Variance</option>
            <option>Maintenance</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Payment Method</label>
          <select className={sel} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option>Bank Transfer</option>
            <option>Cash</option>
            <option>Cheque</option>
          </select>
        </div>
      </div>

      {/* Status + Reference */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={lbl}>Payment Status</label>
          <select className={sel} value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
            <option>Received</option>
            <option>Pending</option>
            <option>Overdue</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Reference No.</label>
          <input
            className={inp + ' font-mono'}
            placeholder="e.g. TXN-001"
            value={referenceNo}
            onChange={(e) => setReferenceNo(e.target.value)}
          />
        </div>
      </div>

      {/* Payer Type + Name */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={lbl}>Payer Type <span className="text-red-500">*</span></label>
          <select
            className={sel}
            value={payerType}
            onChange={(e) => { setPayerType(e.target.value); setFormError('') }}
          >
            <option value="">Select…</option>
            <option>Broker</option>
            <option>Contractor</option>
            <option>End User</option>
            <option>Designer</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Payer Name</label>
          <input
            className={inp}
            placeholder="Full name"
            value={payerName}
            onChange={(e) => setPayerName(e.target.value)}
          />
        </div>
      </div>

      {/* Commission — Broker only */}
      {payerType === 'Broker' && (
        <div>
          <label className={lbl}>Commission Amount (AED)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className={inp}
            placeholder="0.00"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
          />
        </div>
      )}

      {/* Notes */}
      <div>
        <label className={lbl}>Notes (optional)</label>
        <textarea
          rows={2}
          className={inp + ' resize-none'}
          placeholder="Any additional notes…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {formError && <p className="text-xs text-red-600">{formError}</p>}

      <button
        onClick={recordPaymentAndComplete}
        disabled={saving}
        className="w-full py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? 'Saving…' : '✓ Record Payment & Complete'}
      </button>
    </div>
  )
}
