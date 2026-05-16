'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { Task, TaskUpdateInput, Project } from '@/lib/types'
import TaskGroupedList from '@/components/tasks/TaskGroupedList'
import MaterialOrderModal from '@/components/projects/MaterialOrderModal'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function FabDashboard() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view') ?? 'tasks'
  const [materialProject, setMaterialProject] = useState<Project | null>(null)

  const { data, error, isLoading, mutate } = useSWR<{ tasks: Task[] }>(
    '/api/tasks?role=fab',
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true },
  )

  const { data: projectData, mutate: mutateProjects } = useSWR<{ projects: Project[] }>(
    view === 'materials' ? '/api/projects' : null,
    fetcher,
    { refreshInterval: 60000 },
  )

  const tasks = data?.tasks ?? []
  const projects = projectData?.projects ?? []

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

      {/* Materials view: project picker + order button */}
      {view === 'materials' && (
        <div className="mb-4 bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
          <p className="text-sm font-semibold text-gray-700">F3 — Order Materials</p>
          {projects.length === 0 ? (
            <p className="text-xs text-gray-400">Loading projects…</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setMaterialProject(p)}
                  className="text-xs bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 rounded-lg px-3 py-1.5 font-medium"
                >
                  {p.projectId} — {p.projectName}
                </button>
              ))}
            </div>
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

      {materialProject && (
        <MaterialOrderModal
          project={materialProject}
          onClose={() => setMaterialProject(null)}
          onCreated={() => mutateProjects()}
        />
      )}
    </div>
  )
}
