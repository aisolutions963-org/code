'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Quotation, Payment, Material, Role } from '@/lib/types'

const fetcher = (url: string) =>
  fetch(url).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() })

const canSeePayments = (role: Role) => role === 'manager' || role === 'superadmin'

interface Props {
  projectId: string
  role: Role
}

export default function ProjectFormsSection({ projectId, role }: Props) {
  const [open, setOpen] = useState(false)
  const showPayments = canSeePayments(role)

  const done = (d: unknown, e: unknown) => d !== undefined || e !== undefined

  const { data: quotationsData, error: quotationsError } = useSWR<{ quotations: Quotation[] }>(
    open ? `/api/projects/${projectId}/quotation` : null,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const { data: materialsData, error: materialsError } = useSWR<{ materials: Material[] }>(
    open ? `/api/projects/${projectId}/materials` : null,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const { data: paymentsData, error: paymentsError } = useSWR<{ payments: Payment[] }>(
    open && showPayments ? `/api/payments?projectId=${projectId}` : null,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )

  const quotations = quotationsData?.quotations ?? []
  const materials = materialsData?.materials ?? []
  const payments = paymentsData?.payments ?? []
  const total = quotations.length + materials.length + (showPayments ? payments.length : 0)

  const allLoaded = done(quotationsData, quotationsError) && done(materialsData, materialsError) &&
    (!showPayments || done(paymentsData, paymentsError))

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors group"
      >
        <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Forms
        {total > 0 && (
          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-semibold">{total}</span>
        )}
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Payments — manager & superadmin only */}
          {showPayments && payments.length > 0 && (
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-green-50 border-b border-green-100">
                <p className="text-xs font-semibold text-green-700">Payments ({payments.length})</p>
              </div>
              <div className="divide-y divide-gray-50">
                {payments.map((p) => (
                  <div key={p.id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-700">{p.paymentType}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {p.paymentMethod}{p.receivedDate ? ` · ${p.receivedDate}` : p.dueDate ? ` · Due ${p.dueDate}` : ''}
                        {p.referenceNo ? ` · Ref: ${p.referenceNo}` : ''}
                        {p.recordedBy ? ` · by ${p.recordedBy}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-semibold text-gray-700">AED {p.amount.toLocaleString()}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                        p.paymentStatus === 'Received'
                          ? 'bg-green-100 text-green-700'
                          : p.paymentStatus === 'Pending'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-500'
                      }`}>
                        {p.paymentStatus}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* F5 — Quotation */}
          {quotations.length > 0 && (
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-blue-50 border-b border-blue-100">
                <p className="text-xs font-semibold text-blue-700">F5 — Quotation ({quotations.length} items)</p>
              </div>
              <div className="divide-y divide-gray-50">
                {quotations.map((q) => (
                  <div key={q.id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{q.name}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                        {q.description ?? ''}
                        {q.recordedBy ? `${q.description ? ' · ' : ''}by ${q.recordedBy}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {q.quantity != null && q.unitPrice != null && (
                        <span className="text-xs text-gray-500">
                          {q.quantity} × AED {q.unitPrice.toLocaleString()}
                        </span>
                      )}
                      {q.quotationStatus && (
                        <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                          {q.quotationStatus}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* F3 — Materials */}
          {materials.length > 0 && (
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-orange-50 border-b border-orange-100">
                <p className="text-xs font-semibold text-orange-700">F3 — Materials ({materials.length})</p>
              </div>
              <div className="divide-y divide-gray-50">
                {materials.map((m) => (
                  <div key={m.id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{m.name}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {m.requestDate ?? ''}
                        {m.requestedBy ? `${m.requestDate ? ' · ' : ''}by ${m.requestedBy}` : ''}
                        {m.supplier ? ` · ${m.supplier}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {m.quantity != null && m.unit && (
                        <span className="text-xs text-gray-500">{m.quantity} {m.unit}</span>
                      )}
                      {m.orderStatus && (
                        <span className="text-[10px] font-semibold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">
                          {m.orderStatus}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!allLoaded && (
            <p className="text-xs text-gray-400 py-2">Loading…</p>
          )}

          {allLoaded && total === 0 && (
            <p className="text-xs text-gray-400 py-2">No forms submitted yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
