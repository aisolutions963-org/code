'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { Task, TaskUpdateInput, Project, Material } from '@/lib/types'
import TaskGroupedList from '@/components/tasks/TaskGroupedList'
import MaterialOrderModal from '@/components/projects/MaterialOrderModal'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const STATUS_COLORS: Record<string, string> = {
  Pending: 'bg-yellow-100 text-yellow-700',
  Approved: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
  'Needs Revision': 'bg-orange-100 text-orange-700',
}

export default function FabDashboard() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view') ?? 'tasks'
  const [showMaterialModal, setShowMaterialModal] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  const { data, error, isLoading, mutate } = useSWR<{ tasks: Task[] }>(
    '/api/tasks?role=fabrication',
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true },
  )

  const { data: projectData } = useSWR<{ projects: Project[] }>(
    view === 'materials' ? '/api/projects' : null,
    fetcher,
    { refreshInterval: 60000 },
  )

  const { data: materialData, mutate: mutateMaterials } = useSWR<{ materials: Material[] }>(
    view === 'materials' && selectedProjectId
      ? `/api/projects/${selectedProjectId}/materials`
      : null,
    fetcher,
    { refreshInterval: 30000 },
  )

  const tasks = data?.tasks ?? []
  const projects = projectData?.projects ?? []
  const submittedMaterials = materialData?.materials ?? []

  const handleUpdate = async (id: string, fields: Partial<TaskUpdateInput>) => {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })
    if (!res.ok) {
      const body = await res.json()
      throw new Error(body.error ?? 'فشل التحديث')
    }
    mutate()
  }

  const open = tasks.filter((t) => t.status !== 'Completed')
  const inProgress = tasks.filter((t) => t.status === 'In Progress')
  const completed = tasks.filter((t) => t.status === 'Completed')

  let visibleTasks = tasks
  if (view === 'materials') visibleTasks = tasks.filter((t) => t.fabricationPath || t.plannedProdStartDate)
  if (view === 'timeline') {
    visibleTasks = tasks
      .filter((t) => t.plannedProdStartDate || t.expectedFabEndDate)
      .sort((a, b) => {
        const da = a.plannedProdStartDate ?? ''
        const db = b.plannedProdStartDate ?? ''
        return da.localeCompare(db)
      })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto" dir="rtl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">لوحة التصنيع</h1>
        <p className="text-sm text-gray-500 mt-0.5">مهام الإنتاج والتصنيع</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-900">{open.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">المهام المفتوحة</p>
        </div>
        <div className="bg-white rounded-xl border border-blue-200 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-blue-600">{inProgress.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">قيد التنفيذ</p>
        </div>
        <div className="bg-white rounded-xl border border-green-200 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-green-600">{completed.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">مكتمل</p>
        </div>
      </div>

      {view === 'timeline' && visibleTasks.length > 0 && (
        <div className="mb-4 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">الجدول الزمني للإنتاج</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {visibleTasks.map((t) => (
              <div key={t.id} className="px-4 py-3 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-gray-900">{t.taskName}</p>
                  <p className="text-xs text-gray-400 font-mono">{t.projectId}</p>
                </div>
                <div className="text-left text-xs text-gray-500 space-y-0.5">
                  {t.plannedProdStartDate && <p>البداية: {t.plannedProdStartDate}</p>}
                  {t.expectedFabEndDate && <p>النهاية: {t.expectedFabEndDate}</p>}
                  {t.fabricationPath && (
                    <span className="inline-block bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-xs">
                      {t.fabricationPath}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Materials view */}
      {view === 'materials' && (
        <div className="space-y-4 mb-4">
          {/* Header + order button */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">F3 — Material Order</p>
            <button
              onClick={() => setShowMaterialModal(true)}
              className="text-xs bg-green-600 text-white hover:bg-green-700 rounded-lg px-3 py-1.5 font-medium"
            >
              + New Order
            </button>
          </div>

          {/* Project selector to view submitted orders */}
          {projects.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">View Orders by Project</p>
              <div className="flex flex-wrap gap-2">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProjectId(prev => prev === p.id ? null : p.id)}
                    className={`text-xs border rounded-lg px-3 py-1.5 font-medium transition-colors ${
                      selectedProjectId === p.id
                        ? 'bg-brand-600 border-brand-600 text-white'
                        : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {p.projectId ?? p.projectName}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Submitted orders list */}
          {selectedProjectId && submittedMaterials.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-700">Submitted Orders ({submittedMaterials.length})</p>
              </div>
              <div className="divide-y divide-gray-50">
                {submittedMaterials.map((m) => (
                  <div key={m.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{m.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {m.quantity != null && `${m.quantity} ${m.unit ?? ''}`}
                        {m.supplier && ` · ${m.supplier}`}
                        {m.expectedArrivalDate && ` · Needed: ${m.expectedArrivalDate}`}
                      </p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[m.orderStatus ?? 'Pending'] ?? 'bg-gray-100 text-gray-600'}`}>
                      {m.orderStatus ?? 'Pending'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {selectedProjectId && submittedMaterials.length === 0 && (
            <p className="text-center py-6 text-sm text-gray-400">No material orders for this project.</p>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          فشل تحميل المهام. <button onClick={() => mutate()} className="underline">إعادة المحاولة</button>
        </div>
      )}

      {!error && view !== 'timeline' && (
        <TaskGroupedList loading={isLoading} tasks={visibleTasks} role="fabrication" onUpdate={handleUpdate} />
      )}

      {showMaterialModal && (
        <MaterialOrderModal
          projects={projects}
          onClose={() => setShowMaterialModal(false)}
          onCreated={() => {
            setShowMaterialModal(false)
            mutateMaterials()
          }}
        />
      )}
    </div>
  )
}
