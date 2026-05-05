'use client'

import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { Task, TaskUpdateInput } from '@/lib/types'
import TaskList from '@/components/tasks/TaskList'
import TaskGroupedList from '@/components/tasks/TaskGroupedList'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function FabDashboard() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view') ?? 'tasks'

  const { data, error, isLoading, mutate } = useSWR<{ tasks: Task[] }>(
    '/api/tasks?role=fab',
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true },
  )

  const tasks = data?.tasks ?? []

  const handleUpdate = async (id: string, fields: Partial<TaskUpdateInput>) => {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })
    if (!res.ok) {
      const body = await res.json()
      throw new Error(body.error ?? 'Update failed')
    }
    mutate()
  }

  const open = tasks.filter((t) => t.status !== 'Completed')
  const inProgress = tasks.filter((t) => t.status === 'In Progress')
  const completed = tasks.filter((t) => t.status === 'Completed')

  let visibleTasks = tasks
  if (view === 'team') visibleTasks = tasks
  if (view === 'materials') visibleTasks = tasks.filter((t) => t.fabricationPath)
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
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Fabrication Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Production & fabrication tasks</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-900">{open.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Open Tasks</p>
        </div>
        <div className="bg-white rounded-xl border border-blue-200 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-blue-600">{inProgress.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">In Progress</p>
        </div>
        <div className="bg-white rounded-xl border border-green-200 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-green-600">{completed.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Completed</p>
        </div>
      </div>

      {view === 'timeline' && visibleTasks.length > 0 && (
        <div className="mb-4 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Production Timeline</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {visibleTasks.map((t) => (
              <div key={t.id} className="px-4 py-3 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-gray-900">{t.taskName}</p>
                  <p className="text-xs text-gray-400 font-mono">{t.projectId}</p>
                </div>
                <div className="text-right text-xs text-gray-500 space-y-0.5">
                  {t.plannedProdStartDate && <p>Start: {t.plannedProdStartDate}</p>}
                  {t.expectedFabEndDate && <p>End: {t.expectedFabEndDate}</p>}
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

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          Failed to load tasks. <button onClick={() => mutate()} className="underline">Retry</button>
        </div>
      )}

      {!isLoading && !error && view !== 'timeline' && (
        <TaskGroupedList tasks={visibleTasks} role="fabrication" onUpdate={handleUpdate} />
      )}
    </div>
  )
}
