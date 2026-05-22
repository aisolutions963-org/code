'use client'

import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Task, TaskUpdateInput } from '@/lib/types'
import { useSession } from '@/app/dashboard/layout-client'
import ItemBoard from '@/components/projects/ItemBoard'
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
  }

  const displayName = data?.projectNickname ?? data?.projectName ?? '…'
  const projectRef = data?.projectRef ?? ''

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <div className="flex items-start gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-gray-400 uppercase">{projectRef}</span>
              {data?.projectStage && (
                <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-medium border border-teal-200">
                  {data.projectStage}
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900 mt-0.5">{displayName}</h1>
            <p className="text-sm text-gray-500 mt-0.5">Item board — progress per quotation item</p>
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-3/5" />
              <div className="h-3 bg-gray-100 rounded w-4/5" />
              <div className="h-1.5 bg-gray-100 rounded-full w-full" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          Failed to load item board.{' '}
          <button onClick={() => mutate()} className="underline">Retry</button>
        </div>
      )}

      {!isLoading && !error && data && (
        <ItemBoard
          items={data.items}
          role={role}
          onUpdate={handleUpdate}
          onMutate={() => mutate()}
        />
      )}
    </div>
  )
}
