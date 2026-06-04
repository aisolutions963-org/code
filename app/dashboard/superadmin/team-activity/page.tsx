'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Badge from '@/components/ui/Badge'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface TeamTask {
  id: string
  taskName: string
  status: string
  department: string[]
  projectRef: string
  projectRecordId: string
}

interface TeamGroup {
  name: string
  role: string
  userId: number
  tasks: TeamTask[]
}

const STATUS_VARIANT: Record<string, 'blue' | 'green' | 'orange' | 'gray' | 'red'> = {
  'In Progress': 'blue',
  'Completed': 'green',
  'Pending Approval': 'orange',
  'To Do': 'gray',
  'Locked': 'gray',
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Superadmin',
  manager: 'Manager',
  sed: 'SED',
  fabrication: 'Fabrication',
  installation: 'Installation',
}

const ROLE_COLORS: Record<string, string> = {
  superadmin: 'bg-brand-100 text-brand-700',
  manager: 'bg-green-100 text-green-700',
  sed: 'bg-purple-100 text-purple-700',
  fabrication: 'bg-amber-100 text-amber-700',
  installation: 'bg-blue-100 text-blue-700',
}

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function PersonSection({ group }: { group: TeamGroup }) {
  const [expanded, setExpanded] = useState(false)
  const roleLabel = ROLE_LABELS[group.role] ?? group.role
  const roleColor = ROLE_COLORS[group.role] ?? 'bg-gray-100 text-gray-600'
  const activeTasks = group.tasks.filter((t) => t.status !== 'Locked' && t.status !== 'Completed')

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-gray-500">
              {group.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-900">{group.name}</p>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${roleColor}`}>
              {roleLabel}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {activeTasks.length > 0 && (
            <span className="text-xs bg-brand-100 text-brand-700 font-semibold px-2 py-0.5 rounded-full">
              {activeTasks.length} active
            </span>
          )}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
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
                    <td className="px-4 py-2.5 text-xs text-gray-500">{t.department?.join(', ') || '—'}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={STATUS_VARIANT[t.status] ?? 'gray'} size="sm">{t.status}</Badge>
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

export default function TeamActivityPage() {
  const { data, isLoading, error } = useSWR<{ groups: TeamGroup[] }>(
    '/api/superadmin/team-tasks',
    fetcher,
    { refreshInterval: 60000 },
  )

  const groups = data?.groups ?? []

  return (
    <div className="p-6 space-y-5 min-w-0">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Team Activity</h2>
        <p className="text-sm text-gray-500">Active tasks for every team member, grouped by person</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          Failed to load team tasks.
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-sm text-gray-400">No active tasks found across the team.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <PersonSection key={`${g.name}-${g.role}`} group={g} />
          ))}
        </div>
      )}
    </div>
  )
}
