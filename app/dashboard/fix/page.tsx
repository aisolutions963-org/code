'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { Task, TaskUpdateInput, Project, InstallationLog } from '@/lib/types'
import TaskList from '@/components/tasks/TaskList'
import HandoverModal from '@/components/projects/HandoverModal'
import InstallationLogModal from '@/components/projects/InstallationLogModal'
import AllMaterialsView from '@/components/materials/AllMaterialsView'

interface AssignmentNote { id: number; title: string; body: string; created_at: string; read: number }

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function FixDashboard() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view') ?? 'tasks'
  const [handoverProject, setHandoverProject] = useState<Project | null>(null)
  const [logProject, setLogProject] = useState<Project | null>(null)

  const { data, error, isLoading, mutate } = useSWR<{ tasks: Task[] }>(
    '/api/tasks?role=installation',
    fetcher,
    { refreshInterval: 300_000 },
  )

  const { data: projectData, mutate: mutateProjects } = useSWR<{ projects: Project[] }>(
    '/api/projects',
    fetcher,
    { refreshInterval: 300_000 },
  )

  const { data: notifData, mutate: mutateNotifs } = useSWR<{ notifications: AssignmentNote[] }>(
    '/api/notifications',
    fetcher,
    { refreshInterval: 300_000 },
  )

  const assignmentNotes = (notifData?.notifications ?? []).filter(
    (n) => n.title === 'Installation team assigned',
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
  if (view === 'deliveries') visibleTasks = tasks.filter((t) => !!t.completionDate)
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

      {/* Materials view */}
      {view === 'materials' && <AllMaterialsView role="installation" />}

      {/* Installation Logs view */}
      {view === 'logs' && (
        <LogsView projects={projects} onNewLog={(p) => setLogProject(p)} />
      )}

      {view !== 'logs' && view !== 'materials' && (
        <>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              فشل تحميل المهام. <button onClick={() => mutate()} className="underline">إعادة المحاولة</button>
            </div>
          )}

          {assignmentNotes.length > 0 && (
            <div className="mb-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">ملاحظات التكليف</p>
              {assignmentNotes.map((note) => (
                <div
                  key={note.id}
                  className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
                    note.read ? 'bg-white border-gray-200' : 'bg-indigo-50 border-indigo-200'
                  }`}
                >
                  <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-800">تم تعيينك في فريق التركيب</p>
                    <p className="text-xs text-gray-600 mt-0.5">{note.body}</p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {new Date(note.created_at).toLocaleDateString('ar-AE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  {!note.read && (
                    <span className="mt-1 shrink-0 w-2 h-2 rounded-full bg-indigo-500" />
                  )}
                </div>
              ))}
              <button
                onClick={() => {
                  fetch('/api/notifications', { method: 'PATCH' }).then(() => mutateNotifs())
                }}
                className="text-[11px] text-gray-400 hover:text-gray-600"
              >
                تحديد الكل كمقروء
              </button>
            </div>
          )}

          {!error && (
            <TaskList loading={isLoading} tasks={visibleTasks} role="installation" onUpdate={handleUpdate} />
          )}
        </>
      )}

      {/* F6 — Handover sheet generator */}
      {projects.length > 0 && (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-3">
          <p className="text-sm font-semibold text-gray-700">F6 — إنشاء ورقة التسليم</p>
          <div className="flex flex-wrap gap-2">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => setHandoverProject(p)}
                className="text-xs bg-purple-100 border border-purple-200 text-purple-700 hover:bg-purple-200 rounded-lg px-3 py-1.5 font-medium transition-colors"
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
    { refreshInterval: 300_000 },
  )

  const logs = data?.logs ?? []

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-3">
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

