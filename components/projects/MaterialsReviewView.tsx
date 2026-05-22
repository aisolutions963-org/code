'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Project, Material } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export const STATUS_COLORS: Record<string, string> = {
  'Not ordered':        'bg-gray-100 text-gray-600',
  'Pending approval':   'bg-yellow-100 text-yellow-700',
  'Ordered':            'bg-blue-100 text-blue-700',
  'Partially received': 'bg-orange-100 text-orange-700',
  'Received':           'bg-emerald-100 text-emerald-700',
  'Delayed':            'bg-red-100 text-red-700',
}

export const MATERIAL_STATUSES = [
  'Not ordered',
  'Pending approval',
  'Ordered',
  'Partially received',
  'Received',
  'Delayed',
] as const

export default function MaterialsReviewView({ projects }: { projects: Project[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  const { data, isLoading, mutate } = useSWR<{ materials: Material[] }>(
    selectedId ? `/api/projects/${selectedId}/materials` : null,
    fetcher,
    { refreshInterval: 30000 },
  )
  const materials = data?.materials ?? []

  async function updateStatus(materialId: string, status: string) {
    setUpdating(materialId)
    mutate({ materials: materials.map((m) => m.id === materialId ? { ...m, orderStatus: status } : m) }, false)
    try {
      const res = await fetch(`/api/materials/${materialId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderStatus: status }),
      })
      if (!res.ok) throw new Error('Failed')
    } catch {
      mutate()
    } finally {
      setUpdating(null)
      mutate()
    }
  }

  const active = materials.filter((m) => m.orderStatus !== 'Received')
  const received = materials.filter((m) => m.orderStatus === 'Received')

  return (
    <div className="space-y-4">
      {/* Project selector */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
        <p className="text-sm font-semibold text-gray-700">Material Orders — Select Project</p>
        <div className="flex flex-wrap gap-2">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`text-xs border rounded-lg px-3 py-1.5 font-medium transition-colors ${
                selectedId === p.id
                  ? 'bg-brand-600 border-brand-600 text-white'
                  : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
              }`}
            >
              {p.projectId || p.projectName}
            </button>
          ))}
          {projects.length === 0 && <p className="text-xs text-gray-400">No active projects.</p>}
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full" />
        </div>
      )}

      {!isLoading && selectedId && materials.length === 0 && (
        <p className="text-center py-8 text-sm text-gray-400">No material orders for this project.</p>
      )}

      {active.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Active Orders ({active.length})</p>
          </div>
          <div className="divide-y divide-gray-50">
            {active.map((m) => (
              <div key={m.id} className="px-4 py-3 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{m.name}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-0.5">
                    {m.purpose && <span className="font-medium text-gray-600">{m.purpose}</span>}
                    {m.supplier && <span>Supplier: {m.supplier}</span>}
                    {m.quantity != null && <span>Qty: {m.quantity} {m.unit ?? ''}</span>}
                    {m.expectedArrivalDate && <span>Expected: {m.expectedArrivalDate}</span>}
                    {m.requestedBy && <span>By: {m.requestedBy}</span>}
                  </div>
                  {m.notes && <p className="text-xs text-gray-400 mt-0.5 italic">{m.notes}</p>}
                </div>
                <select
                  value={m.orderStatus ?? 'Not ordered'}
                  disabled={updating === m.id}
                  onChange={(e) => updateStatus(m.id, e.target.value)}
                  className={`text-xs border rounded-lg px-2 py-1.5 font-medium shrink-0 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60 border-transparent ${
                    STATUS_COLORS[m.orderStatus ?? ''] ?? 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {MATERIAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {received.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm opacity-75">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-500">Received ({received.length})</p>
          </div>
          <div className="divide-y divide-gray-50">
            {received.map((m) => (
              <div key={m.id} className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-600">{m.name}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-400 mt-0.5">
                    {m.supplier && <span>{m.supplier}</span>}
                    {m.quantity != null && <span>{m.quantity} {m.unit ?? ''}</span>}
                    {m.actualArrivalDate && <span>Arrived: {m.actualArrivalDate}</span>}
                  </div>
                </div>
                <select
                  value={m.orderStatus ?? 'Received'}
                  disabled={updating === m.id}
                  onChange={(e) => updateStatus(m.id, e.target.value)}
                  className="text-xs border border-transparent rounded-lg px-2 py-1.5 font-medium shrink-0 bg-emerald-100 text-emerald-700 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60"
                >
                  {MATERIAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {!selectedId && (
        <p className="text-center py-10 text-sm text-gray-400">Select a project to review its material orders.</p>
      )}
    </div>
  )
}
