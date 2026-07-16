'use client'

import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { Task, TaskUpdateInput, DocLink } from '@/lib/types'
import TaskList from '@/components/tasks/TaskList'
import AllMaterialsView from '@/components/materials/AllMaterialsView'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface FabSample {
  taskId: string
  projectName: string
  projectNickname: string | null
  projectRef: string | null
  itemName: string | null
  sentToFabAt: string | null
  note: string | null
  links: DocLink[]
}

export default function FabDashboard() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view') ?? 'tasks'
  const { data, error, isLoading, mutate } = useSWR<{ tasks: Task[] }>(
    '/api/tasks?role=fabrication',
    fetcher,
    { refreshInterval: 300_000 },
  )

  const { data: sampleData } = useSWR<{ samples: FabSample[] }>(
    view === 'tasks' ? '/api/fabrication/samples' : null,
    fetcher,
    { refreshInterval: 300_000 },
  )
  const samples = sampleData?.samples ?? []

  const tasks = data?.tasks ?? []

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
        <div className="mb-4 bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">الجدول الزمني للإنتاج</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {visibleTasks.map((t) => (
              <div key={t.id} className="px-4 py-3 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-gray-900">{t.taskName}</p>
                  <p className="text-xs text-gray-500">
                    {t.projectNickname
                      ? t.projectName
                        ? `${t.projectNickname} — ${t.projectName}`
                        : t.projectNickname
                      : (t.projectName ?? t.projectRef ?? t.projectId ?? '')}
                    {t.projectItemName && (
                      <span className="text-teal-700 font-medium"> › {t.projectItemName}</span>
                    )}
                  </p>
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
        <div className="mb-4">
          <AllMaterialsView role="fabrication" />
        </div>
      )}

      {/* Samples to build — read-only cards sent by SED (project details + notes + links) */}
      {view === 'tasks' && samples.length > 0 && (
        <div className="mb-6 space-y-2">
          <p className="text-sm font-semibold text-gray-700">عينات للتصنيع ({samples.length})</p>
          {samples.map((s) => (
            <div key={s.taskId} className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-amber-900">
                    {s.projectNickname
                      ? s.projectName ? `${s.projectNickname} — ${s.projectName}` : s.projectNickname
                      : (s.projectName || s.projectRef || 'مشروع')}
                  </p>
                  <p className="text-[11px] text-amber-600 font-mono mt-0.5">
                    {s.projectRef}{s.itemName ? ` · ${s.itemName}` : ''}
                  </p>
                </div>
                {s.sentToFabAt && (
                  <span className="shrink-0 text-[10px] text-amber-500">
                    {new Date(s.sentToFabAt).toLocaleDateString('ar-AE', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </div>

              {s.note && (
                <p className="text-xs text-amber-900 whitespace-pre-wrap mt-2 leading-relaxed">
                  <span className="font-semibold">ملاحظة: </span>{s.note}
                </p>
              )}

              {s.links.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2" dir="ltr">
                  {s.links.map((l, i) => (
                    l.url ? (
                      <a
                        key={i}
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-medium px-2 py-1 rounded-md bg-white border border-amber-300 text-amber-700 hover:bg-amber-100"
                      >
                        🔗 {l.label || 'رابط'}
                      </a>
                    ) : (
                      <span key={i} className="text-[11px] px-2 py-1 rounded-md bg-white border border-amber-200 text-amber-600">
                        {l.label}{l.notes ? ` — ${l.notes}` : ''}
                      </span>
                    )
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          فشل تحميل المهام. <button onClick={() => mutate()} className="underline">إعادة المحاولة</button>
        </div>
      )}

      {!error && view !== 'timeline' && (
        <TaskList loading={isLoading} tasks={visibleTasks} role="fabrication" onUpdate={handleUpdate} sortByRecent />
      )}

    </div>
  )
}
