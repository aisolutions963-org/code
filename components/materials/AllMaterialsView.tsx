'use client'

import { useState, useMemo } from 'react'
import useSWR from 'swr'
import { Material, Project } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const STATUS_COLORS: Record<string, string> = {
  'Not ordered':        'bg-gray-100 text-gray-600',
  'Pending approval':   'bg-yellow-100 text-yellow-700',
  'Ordered':            'bg-blue-100 text-blue-700',
  'Partially received': 'bg-orange-100 text-orange-700',
  'Received':           'bg-emerald-100 text-emerald-700',
  'Delayed':            'bg-red-100 text-red-700',
}

const MATERIAL_STATUSES = [
  'Not ordered',
  'Pending approval',
  'Ordered',
  'Partially received',
  'Received',
  'Delayed',
] as const

const STATUS_ORDER: Record<string, number> = {
  'Delayed': 0,
  'Not ordered': 1,
  'Pending approval': 2,
  'Ordered': 3,
  'Partially received': 4,
  'Received': 5,
}

export default function AllMaterialsView({ role }: { role: string }) {
  const [search, setSearch] = useState('')
  const [updating, setUpdating] = useState<string | null>(null)

  const canEdit = role === 'superadmin' || role === 'manager' || role === 'fabrication'
  const projectsUrl =
    role === 'superadmin' || role === 'manager' ? '/api/projects?all=true' : '/api/projects'

  const { data: materialsData, isLoading, mutate } = useSWR<{ materials: Material[]; pendingCount: number }>(
    '/api/materials',
    fetcher,
    { refreshInterval: 120_000 },
  )

  const { data: projectsData } = useSWR<{ projects: Project[] }>(
    projectsUrl,
    fetcher,
    { refreshInterval: 300_000 },
  )

  const materials = materialsData?.materials ?? []
  const projects = projectsData?.projects ?? []
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return materials
    return materials.filter((m) => {
      const proj = projectMap.get(m.projects?.[0] ?? '')
      return (
        m.name.toLowerCase().includes(q) ||
        (m.supplier ?? '').toLowerCase().includes(q) ||
        (proj?.projectName ?? '').toLowerCase().includes(q) ||
        (proj?.projectId ?? '').toLowerCase().includes(q) ||
        (proj?.clientName ?? '').toLowerCase().includes(q)
      )
    })
  }, [materials, search, projectMap])

  const grouped = useMemo(() => {
    const map = new Map<string, { project: Project | null; materials: Material[] }>()
    for (const m of filtered) {
      const pid = m.projects?.[0] ?? '__unknown__'
      if (!map.has(pid)) {
        map.set(pid, { project: projectMap.get(pid) ?? null, materials: [] })
      }
      map.get(pid)!.materials.push(m)
    }
    return Array.from(map.entries()).sort(([, a], [, b]) => {
      const urgencyScore = (mats: Material[]) => {
        if (mats.some((m) => m.orderStatus === 'Delayed')) return 0
        if (mats.some((m) => m.orderStatus === 'Not ordered' || m.orderStatus === 'Pending approval')) return 1
        return 2
      }
      return urgencyScore(a.materials) - urgencyScore(b.materials)
    })
  }, [filtered, projectMap])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const m of materials) {
      const s = m.orderStatus ?? 'Not ordered'
      counts[s] = (counts[s] ?? 0) + 1
    }
    return counts
  }, [materials])

  const delayedCount = statusCounts['Delayed'] ?? 0
  const pendingActionCount = (statusCounts['Not ordered'] ?? 0) + (statusCounts['Pending approval'] ?? 0)

  async function updateStatus(materialId: string, status: string) {
    setUpdating(materialId)
    mutate(
      {
        ...materialsData!,
        materials: materials.map((m) => (m.id === materialId ? { ...m, orderStatus: status } : m)),
      },
      false,
    )
    try {
      await fetch(`/api/materials/${materialId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderStatus: status }),
      })
    } catch {
      mutate()
    } finally {
      setUpdating(null)
      mutate()
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Status summary strip */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {(Object.keys(STATUS_COLORS) as (keyof typeof STATUS_COLORS)[]).map((s) => (
          <div key={s} className={`rounded-xl px-3 py-2.5 text-center ${STATUS_COLORS[s]}`}>
            <p className="text-xl font-bold">{statusCounts[s] ?? 0}</p>
            <p className="text-[11px] leading-tight mt-0.5 opacity-80">{s}</p>
          </div>
        ))}
      </div>

      {/* Alert banners */}
      {delayedCount > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
          <p className="text-sm text-red-700 font-medium">
            {delayedCount} delayed order{delayedCount > 1 ? 's' : ''} — needs urgent attention
          </p>
        </div>
      )}
      {pendingActionCount > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 animate-pulse" />
          <p className="text-sm text-amber-700 font-medium">
            {pendingActionCount} order{pendingActionCount > 1 ? 's' : ''} waiting for action
          </p>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by material name, project, supplier…"
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg
            focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ×
          </button>
        )}
      </div>

      {/* Empty state */}
      {grouped.length === 0 && (
        <p className="text-center py-12 text-sm text-gray-400">
          {search ? `No materials match "${search}".` : 'No active material orders.'}
        </p>
      )}

      {/* Project groups */}
      {grouped.map(([pid, { project: p, materials: mats }]) => {
        const pending = mats.filter(
          (m) => m.orderStatus === 'Not ordered' || m.orderStatus === 'Pending approval',
        ).length
        const delayed = mats.filter((m) => m.orderStatus === 'Delayed').length
        const sortedMats = [...mats].sort(
          (a, b) => (STATUS_ORDER[a.orderStatus ?? ''] ?? 99) - (STATUS_ORDER[b.orderStatus ?? ''] ?? 99),
        )

        return (
          <div key={pid} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            {/* Project header */}
            <div className={`px-4 py-3 border-b flex items-center justify-between gap-3 ${
              delayed > 0
                ? 'bg-red-50 border-red-100'
                : pending > 0
                  ? 'bg-amber-50 border-amber-100'
                  : 'bg-gray-50 border-gray-100'
            }`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {p?.projectId && (
                    <span className="font-mono text-[11px] text-gray-400">{p.projectId}</span>
                  )}
                  {p?.projectStage && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/60 text-gray-600 font-medium border border-gray-200/60">
                      {p.projectStage}
                    </span>
                  )}
                </div>
                <p className="font-semibold text-sm text-gray-900 truncate mt-0.5">
                  {p?.projectName ?? 'Unknown Project'}
                </p>
                {p?.clientName && (
                  <p className="text-xs text-gray-500">{p.clientName}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                {delayed > 0 && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                    {delayed} delayed
                  </span>
                )}
                {pending > 0 && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    {pending} pending
                  </span>
                )}
                <span className="text-[11px] font-medium text-gray-400">
                  {mats.length} item{mats.length > 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Materials list */}
            <div className="divide-y divide-gray-50">
              {sortedMats.map((m) => (
                <div
                  key={m.id}
                  className={`px-4 py-3 flex items-start justify-between gap-4 ${
                    m.orderStatus === 'Delayed' ? 'bg-red-50/30' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{m.name}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-0.5">
                      {m.purpose && (
                        <span className="font-medium text-gray-600">{m.purpose}</span>
                      )}
                      {m.quantity != null && (
                        <span>Qty: {m.quantity}{m.unit ? ` ${m.unit}` : ''}</span>
                      )}
                      {m.supplier && <span>Supplier: {m.supplier}</span>}
                      {m.requestDate && <span>Requested: {m.requestDate}</span>}
                      {m.expectedArrivalDate && (
                        <span className={m.orderStatus === 'Delayed' ? 'text-red-600 font-medium' : ''}>
                          ETA: {m.expectedArrivalDate}
                        </span>
                      )}
                      {m.requestedBy && <span>By: {m.requestedBy}</span>}
                    </div>
                    {m.notes && (
                      <p className="text-xs text-gray-400 mt-0.5 italic">{m.notes}</p>
                    )}
                  </div>
                  {canEdit ? (
                    <select
                      value={m.orderStatus ?? 'Not ordered'}
                      disabled={updating === m.id}
                      onChange={(e) => updateStatus(m.id, e.target.value)}
                      className={`text-xs border rounded-lg px-2 py-1.5 font-medium shrink-0
                        focus:outline-none focus:ring-2 focus:ring-brand-400
                        disabled:opacity-60 border-transparent ${
                          STATUS_COLORS[m.orderStatus ?? ''] ?? 'bg-gray-100 text-gray-600'
                        }`}
                    >
                      {MATERIAL_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`text-xs font-medium px-2.5 py-1.5 rounded-lg shrink-0 ${
                      STATUS_COLORS[m.orderStatus ?? ''] ?? 'bg-gray-100 text-gray-600'
                    }`}>
                      {m.orderStatus ?? 'Not ordered'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
