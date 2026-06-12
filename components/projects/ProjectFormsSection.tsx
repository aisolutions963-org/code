'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Quotation, Material, HandoverSheet, Role } from '@/lib/types'

const fetcher = (url: string) =>
  fetch(url).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() })

const canUpdateMaterials = (role: Role) => role === 'manager' || role === 'superadmin' || role === 'fabrication'

const MATERIAL_STATUSES = ['Not ordered', 'Pending approval', 'Ordered', 'Partially received', 'Received', 'Delayed'] as const

function statusStyle(status?: string) {
  switch (status) {
    case 'Received':          return 'bg-green-100 text-green-700'
    case 'Ordered':           return 'bg-blue-100 text-blue-700'
    case 'Partially received': return 'bg-orange-100 text-orange-700'
    case 'Pending approval':  return 'bg-amber-100 text-amber-700'
    case 'Delayed':           return 'bg-red-100 text-red-700'
    default:                  return 'bg-gray-100 text-gray-500'
  }
}

interface Props {
  projectId: string
  role: Role
}

export default function ProjectFormsSection({ projectId, role }: Props) {
  const [open, setOpen] = useState(false)
  const [updating, setUpdating] = useState<Set<string>>(new Set())
  const canEditStatus = canUpdateMaterials(role)

  const { data: quotationsData, error: quotationsError } = useSWR<{ quotations: Quotation[] }>(
    open ? `/api/projects/${projectId}/quotation` : null,
    fetcher, { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const { data: materialsData, error: materialsError, mutate: mutateMaterials } = useSWR<{ materials: Material[] }>(
    open ? `/api/projects/${projectId}/materials` : null,
    fetcher, { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const { data: handoverData, error: handoverError } = useSWR<{ sheets: HandoverSheet[] }>(
    open ? `/api/projects/${projectId}/handover` : null,
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

  const quotations = quotationsData?.quotations ?? []
  const materials = materialsData?.materials ?? []
  const handoverSheets = handoverData?.sheets ?? []
  const total = quotations.length + materials.length + handoverSheets.length
  const allLoaded =
    (quotationsData !== undefined || quotationsError !== undefined) &&
    (materialsData !== undefined || materialsError !== undefined) &&
    (handoverData !== undefined || handoverError !== undefined)

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

          {/* Handover Sheet */}
          {handoverSheets.length > 0 && (
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-purple-50 border-b border-purple-100">
                <p className="text-xs font-semibold text-purple-700">Handover ({handoverSheets.length})</p>
              </div>
              <div className="divide-y divide-gray-50">
                {handoverSheets.map((s) => (
                  <div key={s.id} className="px-3 py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-700">
                        {s.finalInstallationDate ? `Final installation: ${s.finalInstallationDate}` : 'Handover submitted'}
                      </p>
                      {s.recordedBy && (
                        <p className="text-[11px] text-gray-400 mt-0.5">by {s.recordedBy}</p>
                      )}
                      {s.notes && (
                        <p className="text-[11px] text-gray-500 mt-0.5 italic">{s.notes}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                        s.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'
                      }`}>
                        {s.status}
                      </span>
                      {s.customerSatisfaction && (
                        <span className="text-[10px] text-gray-400">Satisfaction: {s.customerSatisfaction}</span>
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
            <p className="text-xs text-gray-400 py-2">No F-forms submitted yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
