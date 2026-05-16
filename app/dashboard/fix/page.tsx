'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { Task, TaskUpdateInput, Project, InstallationLog, GatePass } from '@/lib/types'
import TaskGroupedList from '@/components/tasks/TaskGroupedList'
import HandoverModal from '@/components/projects/HandoverModal'
import InstallationLogModal from '@/components/projects/InstallationLogModal'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function FixDashboard() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view') ?? 'tasks'
  const [handoverProject, setHandoverProject] = useState<Project | null>(null)
  const [logProject, setLogProject] = useState<Project | null>(null)

  const { data, error, isLoading, mutate } = useSWR<{ tasks: Task[] }>(
    '/api/tasks?role=fix',
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true },
  )

  const { data: projectData, mutate: mutateProjects } = useSWR<{ projects: Project[] }>(
    '/api/projects',
    fetcher,
    { refreshInterval: 60000 },
  )

  const tasks = data?.tasks ?? []
  const projects = projectData?.projects ?? []

  const handleUpdate = async (id: string, fields: Partial<TaskUpdateInput>) => {
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }).then(async (res) => {
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'فشل التحديث') }
    })
    mutate()
  }

  const open = tasks.filter((t) => t.status !== 'Completed')
  const urgent = tasks.filter((t) => {
    const d = t.taskStartDate ?? t.completionDate
    if (!d) return false
    const diff = new Date(d).getTime() - Date.now()
    return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000
  })
  const completed = tasks.filter((t) => t.status === 'Completed')

  let visibleTasks = tasks
  if (view === 'deliveries') visibleTasks = tasks.filter((t) => t.handoverDocument && t.handoverDocument.length > 0)
  if (view === 'inspections') visibleTasks = tasks.filter((t) => t.qcCheckAtSiteDone !== undefined)

  return (
    <div className="p-6 max-w-4xl mx-auto" dir="rtl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">لوحة التركيب</h1>
        <p className="text-sm text-gray-500 mt-0.5">إدارة مهام التركيب والتنفيذ</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-900">{open.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">المهام المفتوحة</p>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-red-600">{urgent.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">عاجل</p>
        </div>
        <div className="bg-white rounded-xl border border-green-200 p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-green-600">{completed.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">مكتمل</p>
        </div>
      </div>

      {/* Installation Logs view */}
      {view === 'logs' && (
        <LogsView projects={projects} onNewLog={(p) => setLogProject(p)} />
      )}

      {/* Gate Passes view */}
      {view === 'gate-passes' && (
        <GatePassesView projects={projects} />
      )}

      {view !== 'logs' && view !== 'gate-passes' && (
        <>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              فشل تحميل المهام. <button onClick={() => mutate()} className="underline">إعادة المحاولة</button>
            </div>
          )}

          {!error && (
            <TaskGroupedList loading={isLoading} tasks={visibleTasks} role="installation" onUpdate={handleUpdate} />
          )}
        </>
      )}

      {/* F6 — Handover sheet generator */}
      {projects.length > 0 && (
        <div className="mt-4 bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
          <p className="text-sm font-semibold text-gray-700">F6 — إنشاء ورقة التسليم</p>
          <div className="flex flex-wrap gap-2">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => setHandoverProject(p)}
                className="text-xs bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 rounded-lg px-3 py-1.5 font-medium"
              >
                {p.projectId} — {p.projectName}
              </button>
            ))}
          </div>
        </div>
      )}

      {handoverProject && (
        <HandoverModal
          projectId={handoverProject.id}
          projectName={handoverProject.projectName}
          onClose={() => setHandoverProject(null)}
          onCreated={() => mutateProjects()}
        />
      )}

      {logProject && (
        <InstallationLogModal
          project={logProject}
          onClose={() => setLogProject(null)}
          onCreated={() => setLogProject(null)}
        />
      )}
    </div>
  )
}

function LogsView({ projects, onNewLog }: { projects: Project[]; onNewLog: (p: Project) => void }) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null

  const { data, isLoading, mutate } = useSWR<{ logs: InstallationLog[] }>(
    selectedProjectId ? `/api/projects/${selectedProjectId}/installation-logs` : null,
    fetcher,
    { refreshInterval: 30000 },
  )

  const logs = data?.logs ?? []

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
        <p className="text-sm font-semibold text-gray-700">سجلات التركيب</p>
        <div className="flex flex-wrap gap-2">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedProjectId(p.id)}
              className={`text-xs border rounded-lg px-3 py-1.5 font-medium transition-colors ${
                selectedProjectId === p.id
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
              }`}
            >
              {p.projectId} — {p.projectName}
            </button>
          ))}
        </div>
      </div>

      {selectedProject && (
        <div className="flex justify-between items-center">
          <p className="text-sm font-medium text-gray-700">{selectedProject.projectName}</p>
          <button
            onClick={() => onNewLog(selectedProject)}
            className="text-xs bg-blue-600 text-white hover:bg-blue-700 rounded-lg px-3 py-1.5 font-medium"
          >
            + تسجيل زيارة
          </button>
        </div>
      )}

      {isLoading && <div className="flex justify-center py-8"><div className="animate-spin w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full" /></div>}

      {!isLoading && selectedProjectId && logs.length === 0 && (
        <p className="text-center py-8 text-sm text-gray-400">لا توجد سجلات لهذا المشروع بعد.</p>
      )}

      {logs.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="divide-y divide-gray-50">
            {logs.map((log) => (
              <div key={log.id} className="px-4 py-3 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900">{log.date}</p>
                  {log.installationTeam && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{log.installationTeam}</span>
                  )}
                </div>
                {log.workDescription && (
                  <p className="text-xs text-gray-600 whitespace-pre-line">{log.workDescription}</p>
                )}
                <div className="flex gap-3 text-xs text-gray-400">
                  {log.numberOfLaborers != null && <span>{log.numberOfLaborers} عمال</span>}
                  {log.expectedFinishDate && <span>توقع الانتهاء: {log.expectedFinishDate}</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-2 border-t border-gray-100 flex justify-end">
            <button onClick={() => mutate()} className="text-xs text-gray-400 hover:text-gray-600">تحديث</button>
          </div>
        </div>
      )}

      {!selectedProjectId && (
        <p className="text-center py-10 text-sm text-gray-400">اختر مشروعًا لعرض سجلاته.</p>
      )}
    </div>
  )
}

const GP_STATUS_COLORS: Record<string, string> = {
  Pending: 'bg-gray-100 text-gray-600',
  Ready: 'bg-green-100 text-green-700',
  Delivered: 'bg-blue-100 text-blue-700',
  Cancelled: 'bg-red-100 text-red-600',
}

function GatePassesView({ projects }: { projects: Project[] }) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  const { data, isLoading, mutate } = useSWR<{ gatePasses: GatePass[] }>(
    selectedProjectId ? `/api/gate-passes?projectId=${selectedProjectId}` : null,
    fetcher,
    { refreshInterval: 30000 },
  )

  const gatePasses = data?.gatePasses ?? []

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
        <p className="text-sm font-semibold text-gray-700">تصاريح البوابة</p>
        <div className="flex flex-wrap gap-2">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedProjectId(p.id)}
              className={`text-xs border rounded-lg px-3 py-1.5 font-medium transition-colors ${
                selectedProjectId === p.id
                  ? 'bg-orange-600 border-orange-600 text-white'
                  : 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100'
              }`}
            >
              {p.projectId} — {p.projectName}
            </button>
          ))}
          {projects.length === 0 && <p className="text-xs text-gray-400">لا توجد مشاريع.</p>}
        </div>
      </div>

      {isLoading && <div className="flex justify-center py-8"><div className="animate-spin w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full" /></div>}

      {!isLoading && selectedProjectId && gatePasses.length === 0 && (
        <p className="text-center py-8 text-sm text-gray-400">لا توجد تصاريح بوابة لهذا المشروع بعد.</p>
      )}

      {gatePasses.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="divide-y divide-gray-50">
            {gatePasses.map((gp) => (
              <div key={gp.id} className="px-4 py-3 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900">{gp.name || gp.itemsDescription.slice(0, 40)}</p>
                  {gp.gatePassStatus && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${GP_STATUS_COLORS[gp.gatePassStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                      {gp.gatePassStatus}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-600 whitespace-pre-line">{gp.itemsDescription}</p>
                <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                  <span>التوريد المتوقع: {gp.estimatedSupplyDate}</span>
                  {gp.confirmedDeliveryDate && <span>مؤكد: {gp.confirmedDeliveryDate}</span>}
                  {gp.siteReady && <span className="text-green-600">الموقع جاهز</span>}
                  {gp.clientNotified && <span className="text-blue-600">تم إبلاغ العميل</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-2 border-t border-gray-100 flex justify-end">
            <button onClick={() => mutate()} className="text-xs text-gray-400 hover:text-gray-600">تحديث</button>
          </div>
        </div>
      )}

      {!selectedProjectId && (
        <p className="text-center py-10 text-sm text-gray-400">اختر مشروعًا لعرض تصاريحه.</p>
      )}
    </div>
  )
}
