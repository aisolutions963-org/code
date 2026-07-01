'use client'

import { useState } from 'react'
import useSWR from 'swr'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { Task } from '@/lib/types'
import Badge from '@/components/ui/Badge'
import { Dept, TeamGroup } from './types'
import { fetcher, Spinner } from './shared'
import TaskStatusBadge from './TaskStatusBadge'

const DEPTS: Dept[] = ['All', 'SED', 'Fabrication', 'Installation', 'Management']

const ROLE_LABELS: Record<string, string> = { superadmin: 'Superadmin', manager: 'Manager', sed: 'SED', fabrication: 'Fabrication', installation: 'Installation' }
const ROLE_COLORS: Record<string, string> = { superadmin: 'bg-brand-100 text-brand-700', manager: 'bg-green-100 text-green-700', sed: 'bg-purple-100 text-purple-700', fabrication: 'bg-amber-100 text-amber-700', installation: 'bg-blue-100 text-blue-700' }
const DEPT_COLORS: Record<string, string> = {
  SED:          'bg-purple-100 text-purple-700',
  Fabrication:  'bg-amber-100 text-amber-700',
  Installation: 'bg-blue-100 text-blue-700',
  Management:   'bg-green-100 text-green-700',
  Superadmin:   'bg-brand-100 text-brand-700',
}

function PersonSection({ group }: { group: TeamGroup }) {
  const [expanded, setExpanded] = useState(false)
  const roleLabel = ROLE_LABELS[group.role] ?? group.role
  const roleColor = ROLE_COLORS[group.role] ?? 'bg-gray-100 text-gray-600'
  const activeTasks = group.tasks.filter((t) => t.status !== 'Locked' && t.status !== 'Completed')
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button onClick={() => setExpanded((e) => !e)} className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-gray-500">{group.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</span>
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-900">{group.name}</p>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${roleColor}`}>{roleLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {activeTasks.length > 0 && (
            <span className="text-xs bg-brand-100 text-brand-700 font-semibold px-2 py-0.5 rounded-full">{activeTasks.length} active</span>
          )}
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-gray-100 overflow-x-auto">
          {activeTasks.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-400">No active tasks.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Project</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Task</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Dept</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {activeTasks.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{t.projectRef || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-800 max-w-xs truncate">{t.taskName}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {(t.department ?? []).length === 0 ? <span className="text-xs text-gray-400">—</span> : t.department!.map(d => (
                          <span key={d} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${DEPT_COLORS[d] ?? 'bg-gray-100 text-gray-600'}`}>{d}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={({ 'In Progress': 'blue', 'Completed': 'green', 'Pending Approval': 'orange', 'To Do': 'gray', 'Locked': 'gray' } as Record<string, 'blue'|'green'|'orange'|'gray'|'red'>)[t.status] ?? 'gray'} size="sm">{t.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

export default function ActivityPage() {
  const [viewMode, setViewMode] = useState<'task' | 'person'>('task')
  const [dept, setDept] = useState<Dept>('All')

  const { data, isLoading, mutate } = useSWR<{ tasks: Task[] }>(
    '/api/tasks', fetcher, { refreshInterval: 300_000 },
  )
  const { data: teamData, isLoading: teamLoading } = useSWR<{ groups: TeamGroup[] }>(
    viewMode === 'person' ? '/api/superadmin/team-tasks' : null,
    fetcher, { refreshInterval: 300_000 },
  )

  const tasks = data?.tasks ?? []

  // Airtable may use 'Manager' or 'Management' depending on the template; treat them as equivalent
  function matchesDept(task: Task, d: Dept): boolean {
    if (d === 'All') return true
    if (d === 'Management') return !!(task.department?.some((x) => x === 'Manager' || x === 'Management'))
    return !!(task.department?.includes(d))
  }

  const filtered = tasks.filter((t) => matchesDept(t, dept))

  async function toggleFlag(task: Task) {
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { priorityFlag: !task.priorityFlag } }),
    })
    mutate()
  }

  const deptData = (['SED', 'Fabrication', 'Installation', 'Management'] as Dept[]).map((d) => ({
    dept: d,
    active:    tasks.filter(t => matchesDept(t, d) && t.status !== 'Completed' && t.status !== 'Locked').length,
    completed: tasks.filter(t => matchesDept(t, d) && t.status === 'Completed').length,
  }))

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Team Activity</h2>
          <p className="text-sm text-gray-500">{tasks.length} tasks across all departments</p>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg shrink-0">
          <button onClick={() => setViewMode('task')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === 'task' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>By Task</button>
          <button onClick={() => setViewMode('person')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === 'person' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>By Person</button>
        </div>
      </div>

      {viewMode === 'task' ? (
        <>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tasks by Department</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={deptData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="dept" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="active"    fill="#f59e0b" radius={[3, 3, 0, 0]} name="Active"    />
                <Bar dataKey="completed" fill="#22c55e" radius={[3, 3, 0, 0]} name="Completed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg overflow-x-auto">
            {DEPTS.map((d) => (
              <button key={d} onClick={() => setDept(d)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${dept === d ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{d}</button>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="w-8 px-3 py-2.5" />
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Task</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Dept</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Project</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((t) => {
                    const isCallClient = t.taskName.toLowerCase().includes('call the client') && t.status === 'To Do'
                    return (
                      <tr key={t.id} className={isCallClient ? 'bg-teal-50 border-l-4 border-l-teal-400' : 'hover:bg-gray-50'}>
                        <td className="px-3 py-2.5 text-center">
                          <button onClick={() => toggleFlag(t)} title="Toggle priority">
                            <span className={`text-sm ${t.priorityFlag ? 'text-red-500' : 'text-gray-200 hover:text-gray-400'}`}>⚑</span>
                          </button>
                        </td>
                        <td className="px-4 py-2.5 max-w-xs truncate">
                          {isCallClient ? (
                            <span className="flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5 text-teal-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              <span className="font-semibold text-teal-800">{t.taskName}</span>
                            </span>
                          ) : (
                            <span className="text-gray-800">{t.taskName}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {(t.department ?? []).length === 0 ? <span className="text-xs text-gray-400">—</span> : t.department!.map(d => (
                              <span key={d} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${DEPT_COLORS[d] ?? 'bg-gray-100 text-gray-600'}`}>{d}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-2.5"><TaskStatusBadge status={t.status} /></td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{t.projectRef ?? t.project?.[0] ?? '—'}</td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-8 text-sm text-gray-400">No tasks.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          {teamLoading ? <Spinner /> : (teamData?.groups ?? []).length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-sm text-gray-400">No active tasks found across the team.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(teamData?.groups ?? []).map((g) => <PersonSection key={`${g.name}-${g.role}`} group={g} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
