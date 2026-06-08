'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Quotation, Payment, Material, PurchaseOrder, GatePass, HandoverSheet, Role } from '@/lib/types'

const fetcher = (url: string) =>
  fetch(url).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() })

const canSeePayments = (role: Role) => role === 'manager' || role === 'superadmin'
const canUpdateMaterials = (role: Role) => role === 'manager' || role === 'superadmin' || role === 'fabrication'

const MATERIAL_STATUSES = ['Not ordered', 'Pending approval', 'Ordered', 'Partially received', 'Received', 'Delayed'] as const

function statusStyle(status?: string) {
  switch (status) {
    case 'Received': return 'bg-green-100 text-green-700'
    case 'Ordered': return 'bg-blue-100 text-blue-700'
    case 'Partially received': return 'bg-orange-100 text-orange-700'
    case 'Pending approval': return 'bg-amber-100 text-amber-700'
    case 'Delayed': return 'bg-red-100 text-red-700'
    default: return 'bg-gray-100 text-gray-500'
  }
}

interface Props {
  projectId: string
  role: Role
}

export default function ProjectFormsSection({ projectId, role }: Props) {
  const [open, setOpen] = useState(false)
  const [updating, setUpdating] = useState<Set<string>>(new Set())
  const showPayments = canSeePayments(role)
  const canEditStatus = canUpdateMaterials(role)

  const done = (d: unknown, e: unknown) => d !== undefined || e !== undefined

  const { data: quotationsData, error: quotationsError } = useSWR<{ quotations: Quotation[] }>(
    open ? `/api/projects/${projectId}/quotation` : null,
    fetcher, { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const { data: materialsData, error: materialsError, mutate: mutateMaterials } = useSWR<{ materials: Material[] }>(
    open ? `/api/projects/${projectId}/materials` : null,
    fetcher, { revalidateOnFocus: false, shouldRetryOnError: false },
  )

  async function updateMaterialStatus(materialId: string, status: string) {
    setUpdating((prev) => new Set(prev).add(materialId))
    try {
      const res = await fetch(`/api/materials/${materialId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderStatus: status }),
      })
      if (!res.ok) throw new Error('failed')
      await mutateMaterials()
    } catch {
      // status reverts to server value on next fetch
    } finally {
      setUpdating((prev) => { const s = new Set(prev); s.delete(materialId); return s })
    }
  }
  const { data: paymentsData, error: paymentsError } = useSWR<{ payments: Payment[] }>(
    open && showPayments ? `/api/payments?projectId=${projectId}` : null,
    fetcher, { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const { data: purchaseOrdersData, error: purchaseOrdersError } = useSWR<{ purchaseOrders: PurchaseOrder[] }>(
    open ? `/api/projects/${projectId}/purchase-orders` : null,
    fetcher, { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const { data: gatePassesData, error: gatePassesError } = useSWR<{ gatePasses: GatePass[] }>(
    open ? `/api/gate-passes?projectId=${projectId}` : null,
    fetcher, { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const { data: handoverData, error: handoverError } = useSWR<{ sheets: HandoverSheet[] }>(
    open ? `/api/projects/${projectId}/handover` : null,
    fetcher, { revalidateOnFocus: false, shouldRetryOnError: false },
  )

  const quotations = quotationsData?.quotations ?? []
  const materials = materialsData?.materials ?? []
  const payments = paymentsData?.payments ?? []
  const purchaseOrders = purchaseOrdersData?.purchaseOrders ?? []
  const gatePasses = gatePassesData?.gatePasses ?? []
  const handoverSheets = handoverData?.sheets ?? []

  const total = quotations.length + materials.length + purchaseOrders.length + gatePasses.length + handoverSheets.length
    + (showPayments ? payments.length : 0)

  const allLoaded =
    done(quotationsData, quotationsError) &&
    done(materialsData, materialsError) &&
    done(purchaseOrdersData, purchaseOrdersError) &&
    done(gatePassesData, gatePassesError) &&
    done(handoverData, handoverError) &&
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

          {/* Handover Sheet */}
          {handoverSheets.length > 0 && (
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-purple-50 border-b border-purple-100">
                <p className="text-xs font-semibold text-purple-700">Handover ({handoverSheets.length})</p>
              </div>
              <div className="divide-y divide-gray-50">
                {handoverSheets.map((h) => (
                  <div key={h.id} className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700">
                          {h.finalInstallationDate ? `Final install: ${h.finalInstallationDate}` : 'Handover sheet'}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {h.customerSatisfaction ? `Satisfaction: ${h.customerSatisfaction}` : ''}
                          {h.installationDifficulty ? ` · Difficulty: ${h.installationDifficulty}` : ''}
                          {h.recordedBy ? ` · by ${h.recordedBy}` : ''}
                        </p>
                      </div>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                        h.status === 'Submitted' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {h.status}
                      </span>
                    </div>
                    {h.notes && <p className="text-[11px] text-gray-400 mt-1 italic">{h.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gate Passes */}
          {gatePasses.length > 0 && (
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-sky-50 border-b border-sky-100">
                <p className="text-xs font-semibold text-sky-700">Gate Passes ({gatePasses.length})</p>
              </div>
              <div className="divide-y divide-gray-50">
                {gatePasses.map((g) => (
                  <div key={g.id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{g.itemsDescription}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {g.estimatedSupplyDate ? `Est. supply: ${g.estimatedSupplyDate}` : ''}
                        {g.confirmedDeliveryDate ? ` · Delivered: ${g.confirmedDeliveryDate}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Purchase Orders */}
          {purchaseOrders.length > 0 && (
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-yellow-50 border-b border-yellow-100">
                <p className="text-xs font-semibold text-yellow-700">Purchase Orders ({purchaseOrders.length})</p>
              </div>
              <div className="divide-y divide-gray-50">
                {purchaseOrders.map((po) => (
                  <div key={po.id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{po.supplier ?? po.name}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {po.orderDate ? `Ordered: ${po.orderDate}` : ''}
                        {po.expectedDelivery ? ` · Expected: ${po.expectedDelivery}` : ''}
                        {po.recordedBy ? ` · by ${po.recordedBy}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {po.totalAmount != null && (
                        <span className="text-xs text-gray-500">AED {po.totalAmount.toLocaleString()}</span>
                      )}
                      {po.poStatus && (
                        <span className="text-[10px] font-semibold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">
                          {po.poStatus}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                      {(m.expectedArrivalDate || m.actualArrivalDate) && (
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {m.expectedArrivalDate ? `Expected: ${m.expectedArrivalDate}` : ''}
                          {m.actualArrivalDate ? `${m.expectedArrivalDate ? ' · ' : ''}Arrived: ${m.actualArrivalDate}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {m.quantity != null && m.unit && (
                        <span className="text-xs text-gray-500">{m.quantity} {m.unit}</span>
                      )}
                      {canEditStatus ? (
                        <select
                          value={m.orderStatus ?? 'Not ordered'}
                          disabled={updating.has(m.id)}
                          onChange={(e) => updateMaterialStatus(m.id, e.target.value)}
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border-0 cursor-pointer appearance-none text-center ${statusStyle(m.orderStatus)} ${updating.has(m.id) ? 'opacity-50' : ''}`}
                        >
                          {MATERIAL_STATUSES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusStyle(m.orderStatus)}`}>
                          {m.orderStatus ?? 'Not ordered'}
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
