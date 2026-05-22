'use client'

import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Task, TaskUpdateInput } from '@/lib/types'
import { useSession } from '@/app/dashboard/layout-client'
import ItemBoard from '@/components/projects/ItemBoard'
import TaskList, { TaskListSkeleton } from '@/components/tasks/TaskList'
import { ItemSummary } from '@/components/projects/ItemProgressCard'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface ItemsProgressResponse {
  projectId: string
  projectName: string
  projectRef: string
  projectNickname?: string
  projectStage: string
  items: ItemSummary[]
}

export default function ProjectItemBoardPage({ params }: { params: { id: string } }) {
  const { role } = useSession()
  const router = useRouter()

  const { data, error, isLoading, mutate } = useSWR<ItemsProgressResponse>(
    `/api/projects/${params.id}/items-progress`,
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true },
  )

  const { data: tasksData, isLoading: tasksLoading, mutate: mutateTasks } = useSWR<{ tasks: Task[] }>(
    `/api/tasks?projectId=${params.id}`,
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true },
  )

  const handleUpdate = async (taskId: string, fields: Partial<TaskUpdateInput>) => {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })
    if (!res.ok) {
      const body = await res.json()
      throw new Error(body.error ?? 'Update failed')
    }
    mutate()
    mutateTasks()
  }

  const displayName = data?.projectNickname ?? data?.projectName ?? '…'
  const projectRef = data?.projectRef ?? ''
  const itemCount = data?.items.length ?? 0

  const allTasks = tasksData?.tasks ?? []
  const projectLevelTasks = allTasks.filter((t) => !t.projectItem?.length)
  const hasItems = !isLoading && !error && (data?.items.length ?? 0) > 0
  const hasProjectTasks = !tasksLoading && projectLevelTasks.length > 0
  const bothLoaded = !isLoading && !tasksLoading
  const nothingToShow = bothLoaded && !hasItems && !hasProjectTasks

  return (
    <div>
      {/* Gradient page header */}
      <div className="bg-gradient-to-r from-teal-50 to-white border-b border-teal-100 px-6 py-5">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <div className="flex items-start gap-3">
          <span className="relative flex h-3 w-3 shrink-0 mt-1">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500" />
          </span>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-gray-400 uppercase tracking-wider">{projectRef}</span>
              {data?.projectStage && (
                <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-medium border border-teal-200">
                  {data.projectStage}
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900 mt-0.5">{displayName}</h1>
            {!isLoading && itemCount > 0 && (
              <p className="text-sm text-gray-500 mt-0.5">
                {itemCount} item{itemCount !== 1 ? 's' : ''} in production
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 max-w-5xl mx-auto space-y-8">
        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            Failed to load project data.{' '}
            <button onClick={() => mutate()} className="underline">Retry</button>
          </div>
        )}

        {/* General project tasks */}
        {tasksLoading && <TaskListSkeleton />}

        {!tasksLoading && projectLevelTasks.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Project tasks
            </h2>
            <TaskList
              tasks={projectLevelTasks}
              role={role}
              onUpdate={handleUpdate}
              groupByProject={false}
            />
          </section>
        )}

        {/* Item board */}
        {isLoading && !tasksLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
                <div className="p-4 space-y-3">
                  <div className="flex justify-between">
                    <div className="h-4 bg-gray-100 rounded w-3/5" />
                    <div className="w-6 h-6 bg-gray-100 rounded-full" />
                  </div>
                  <div className="h-14 bg-teal-50 rounded-lg" />
                  <div className="flex gap-1">
                    {[1,2,3,4,5,6].map((d) => <div key={d} className="w-2 h-2 bg-gray-100 rounded-full" />)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {hasItems && (
          <section>
            {hasProjectTasks && (
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Items
              </h2>
            )}
            <ItemBoard
              items={data!.items}
              role={role}
              onUpdate={handleUpdate}
              onMutate={() => mutate()}
            />
          </section>
        )}

        {/* Empty state */}
        {nothingToShow && (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <p className="text-gray-700 text-sm font-medium">No tasks for your role on this project</p>
            <p className="text-gray-400 text-xs mt-1">Tasks will appear here once they become active</p>
          </div>
        )}
      </div>
    </div>
  )
}
