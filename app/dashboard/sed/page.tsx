'use client'

import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { Task, TaskUpdateInput } from '@/lib/types'
import TaskList from '@/components/tasks/TaskList'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function SedDashboard() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view') ?? 'tasks'

  const { data, error, isLoading, mutate } = useSWR<{ tasks: Task[] }>(
    '/api/tasks?role=sed',
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
  const pendingApproval = tasks.filter((t) => t.status === 'Pending Approval')
  const completed = tasks.filter((t) => t.status === 'Completed')

  let visibleTasks = tasks
  if (view === 'approvals') visibleTasks = tasks.filter((t) => t.conceptDesignApproval || t.sampleApproval || t.quotationOutcome)
  if (view === 'site-visits') visibleTasks = tasks.filter((t) => t.taskStartDate)
  if (view === 'qc') visibleTasks = tasks.filter((t) => t.qcCheckAtSiteDone !== undefined)
  if (view === 'projects') visibleTasks = tasks

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">SED Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Sales, design & client management tasks</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-900">{open.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Open Tasks</p>
        </div>
        <div className="bg-white rounded-xl border border-orange-200 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-orange-500">{pendingApproval.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Pending Approval</p>
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
        <TaskList tasks={visibleTasks} role="sed" onUpdate={handleUpdate} />
      )}
    </div>
  )
}
