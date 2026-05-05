'use client'

import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { Task, TaskUpdateInput } from '@/lib/types'
import TaskList from '@/components/tasks/TaskList'
import TaskGroupedList from '@/components/tasks/TaskGroupedList'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function useTaskUpdate() {
  return async (id: string, fields: Partial<TaskUpdateInput>) => {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error ?? 'Update failed')
    }
  }
}

export default function FixDashboard() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view') ?? 'tasks'

  const { data, error, isLoading, mutate } = useSWR<{ tasks: Task[] }>(
    '/api/tasks?role=fix',
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true },
  )

  const onUpdate = useTaskUpdate()

  const handleUpdate = async (id: string, fields: Partial<TaskUpdateInput>) => {
    await onUpdate(id, fields)
    mutate()
  }

  const tasks = data?.tasks ?? []

  const open = tasks.filter((t) => t.status !== 'Completed')
  const urgent = tasks.filter((t) => {
    const d = t.taskStartDate ?? t.completionDate
    if (!d) return false
    const diff = new Date(d).getTime() - Date.now()
    return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000
  })
  const completed = tasks.filter((t) => t.status === 'Completed')

  // Filter by view
  let visibleTasks = tasks
  if (view === 'team') visibleTasks = tasks
  if (view === 'deliveries') visibleTasks = tasks.filter((t) => t.handoverDocument && t.handoverDocument.length > 0)
  if (view === 'inspections') visibleTasks = tasks.filter((t) => t.qcCheckAtSiteDone !== undefined)
  if (view === 'logs') visibleTasks = completed

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Installation Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your installation tasks</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-900">{open.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Open Tasks</p>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-red-600">{urgent.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Urgent</p>
        </div>
        <div className="bg-white rounded-xl border border-green-200 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-green-600">{completed.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Completed</p>
        </div>
      </div>

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

      {!isLoading && !error && (
        <TaskGroupedList tasks={visibleTasks} role="installation" onUpdate={handleUpdate} />
      )}
    </div>
  )
}
