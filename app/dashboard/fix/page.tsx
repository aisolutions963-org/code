'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { Task, TaskUpdateInput, Project, ClientRequest } from '@/lib/types'
import type { CalendarEvent } from '@/lib/airtable/calendar'
import TaskList from '@/components/tasks/TaskList'
import HandoverModal from '@/components/projects/HandoverModal'
import AllMaterialsView from '@/components/materials/AllMaterialsView'
import UnifiedCalendar from '@/components/calendar/UnifiedCalendar'
import Badge from '@/components/ui/Badge'

interface MaintenanceRecord {
  id: string
  maintenanceId: string
  warrantyType?: string
  startDate?: string
  endDate?: string
  daysRemaining: number
  projectNames: string[]
}

function WarrantyView() {
  const { data: mData, isLoading: mLoading } = useSWR<{ records: MaintenanceRecord[] }>(
    '/api/maintenance', fetcher, { refreshInterval: 300_000 },
  )
  const { data: pData, isLoading: pLoading } = useSWR<{ projects: Project[] }>(
    '/api/projects?stage=Closed%20and%20active%20warranty', fetcher, { refreshInterval: 300_000 },
  )
  const { data: crData, isLoading: crLoading } = useSWR<{ requests: ClientRequest[] }>(
    '/api/client-requests', fetcher, { refreshInterval: 300_000 },
  )

  if (mLoading || pLoading || crLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const records = mData?.records ?? []
  const warrantyProjects = pData?.projects ?? []
  const maintenanceRequests = (crData?.requests ?? []).filter((r) => r.requestType === 'Maintenance')
  const expiringSoon = records.filter((r) => r.daysRemaining >= 0 && r.daysRemaining < 30).length
  const expired = records.filter((r) => r.daysRemaining < 0).length

  return (
    <div className="space-y-5">
      {/* Summary chips */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Active Warranty', value: warrantyProjects.length, color: 'text-teal-600' },
          { label: 'Maintenance Jobs', value: maintenanceRequests.length, color: 'text-blue-600' },
          { label: 'Expiring < 30d', value: expiringSoon, color: 'text-orange-500' },
          { label: 'Expired', value: expired, color: 'text-red-600' },
        ].map((m) => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-3 text-center shadow-sm">
            <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
            <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Maintenance client requests */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Maintenance Jobs ({maintenanceRequests.length})
        </p>
        {maintenanceRequests.length === 0 ? (
          <p className="text-sm text-gray-400 py-3">No maintenance jobs.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Reference</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Parent Project</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {maintenanceRequests.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.tradeReference ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-700">{r.parentProjectName ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{r.clientName}</td>
                      <td className="px-4 py-3">
                        <Badge variant={r.projectStage === 'Closed' || r.projectStage === 'Closed and active warranty' ? 'green' : 'blue'} size="sm">
                          {r.projectStage}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Active warranty projects */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Active Warranty Projects ({warrantyProjects.length})
        </p>
        {warrantyProjects.length === 0 ? (
          <p className="text-sm text-gray-400 py-3">No projects currently in active warranty.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Project</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {warrantyProjects.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.projectName}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{p.clientName ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{p.projectId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Warranty records */}
      {records.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Warranty Records ({records.length})
          </p>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">ID</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Project</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">End Date</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Remaining</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {records.map((r) => {
                    const d = r.daysRemaining
                    const color = d < 0 ? 'red' : d < 30 ? 'orange' : 'green'
                    const label = d < 0 ? `Expired ${Math.abs(d)}d ago` : `${d}d left`
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.maintenanceId}</td>
                        <td className="px-4 py-3 text-xs text-gray-700">{r.projectNames.join(', ') || '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-600">{r.warrantyType ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{r.endDate ?? '—'}</td>
                        <td className="px-4 py-3"><Badge variant={color} size="sm">{label}</Badge></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface AssignmentNote { id: number; title: string; body: string; created_at: string; read: number }

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function FixDashboard() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view') ?? 'tasks'
  const [handoverProject, setHandoverProject] = useState<Project | null>(null)

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

  const { data: myEventsData } = useSWR<{ events: CalendarEvent[] }>(
    '/api/calendar?mine=true',
    fetcher,
    { refreshInterval: 300_000 },
  )
  const today = new Date().toISOString().slice(0, 10)
  const myCalendarEvents = (myEventsData?.events ?? []).sort((a, b) => a.date.localeCompare(b.date))
  const upcomingInstallations = myCalendarEvents.filter(
    (ev) => ev.type === 'installation' && ev.date >= today,
  )
  const todayInstallations = upcomingInstallations.filter((ev) => ev.date === today)
  const laterInstallations = upcomingInstallations.filter((ev) => ev.date > today)

  const assignmentNotes = (notifData?.notifications ?? []).filter(
    (n) =>
      n.title === 'Installation team assigned' ||
      n.title.startsWith('Installation assigned') ||
      n.title.startsWith('Factory work assigned'),
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

      <div className="grid grid-cols-3 gap-2 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-2 sm:p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-900">{open.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">المهام المفتوحة</p>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-2 sm:p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-red-600">{urgent.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">عاجل</p>
        </div>
        <div className="bg-white rounded-xl border border-green-200 p-2 sm:p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-green-600">{completed.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">مكتمل</p>
        </div>
      </div>

      {/* Warranty / maintenance view */}
      {view === 'warranty' && <WarrantyView />}

      {/* Materials view */}
      {view === 'materials' && <AllMaterialsView role="installation" />}

      {/* Calendar view */}
      {view === 'calendar' && (
        <UnifiedCalendar filterTypes={['installation', 'fabrication', 'delivery']} />
      )}

      {view !== 'materials' && view !== 'calendar' && view !== 'warranty' && (
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

          {/* Upcoming installation dates from calendar — shown in deliveries view */}
          {view === 'deliveries' && (
            <div className="mb-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">مواعيد التركيب</p>
              {upcomingInstallations.length === 0 && (
                <p className="text-sm text-gray-400 py-3 text-center">لا توجد مواعيد تركيب قادمة</p>
              )}
              {todayInstallations.length > 0 && (
                <>
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest pt-1">اليوم</p>
                  {todayInstallations.map((ev) => (
                    <div key={ev.id} className="bg-blue-50 border border-blue-400 rounded-xl px-4 py-3 flex items-start gap-3">
                      <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-blue-200 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-800">{ev.title}</p>
                        {ev.projectName && <p className="text-xs text-gray-500 mt-0.5">{ev.projectName}</p>}
                        {ev.notes && <p className="text-xs text-gray-500 mt-0.5">{ev.notes}</p>}
                        <p className="text-[10px] text-gray-400 mt-1">
                          {ev.createdBy && `${ev.createdBy}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {laterInstallations.length > 0 && (
                <>
                  {todayInstallations.length > 0 && <div className="border-t border-gray-100 pt-1" />}
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pt-1">القادمة</p>
                  {laterInstallations.map((ev) => (
                    <div key={ev.id} className="bg-white border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3">
                      <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-800">{ev.title}</p>
                        {ev.projectName && <p className="text-xs text-gray-500 mt-0.5">{ev.projectName}</p>}
                        {ev.notes && <p className="text-xs text-gray-500 mt-0.5">{ev.notes}</p>}
                        <p className="text-[10px] text-gray-400 mt-1">
                          {new Date(ev.date).toLocaleDateString('ar-AE', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
                          {ev.createdBy && ` · ${ev.createdBy}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </>
              )}
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
          quotationNumber={handoverProject.quotationNumber}
          quotationReference={handoverProject.quotationReference}
          onClose={() => setHandoverProject(null)}
          onCreated={() => mutateProjects()}
        />
      )}
    </div>
  )
}
