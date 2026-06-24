'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Project, Task } from '@/lib/types'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { fetcher, Spinner } from './shared'

function PhaseGateCard({ project: p, onAdvance }: { project: Project; onAdvance: (id: string) => Promise<void> }) {
  const [advancing, setAdvancing] = useState(false)
  const [err, setErr] = useState('')
  const [expanded, setExpanded] = useState(false)
  const { data: detail } = useSWR<{ project: Project & { tasks?: Task[] } }>(
    expanded ? `/api/projects/${p.id}` : null,
    fetcher,
  )

  async function advance() {
    setAdvancing(true); setErr('')
    try { await onAdvance(p.id) } catch (e) { setErr(e instanceof Error ? e.message : 'Failed') } finally { setAdvancing(false) }
  }

  const incompleteTasks = (detail?.project?.tasks ?? []).filter(
    (t) => t.status !== 'Completed' && t.status !== 'Locked',
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4 flex items-center gap-3">
        <button onClick={() => setExpanded((e) => !e)} className="text-gray-400 hover:text-gray-600">
          <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-gray-400">{p.projectId}</span>
            <Badge variant={p.projectStage === 'Open' ? 'blue' : p.projectStage === 'Preparing' ? 'orange' : 'gray'}>
              {p.projectStage}
            </Badge>
          </div>
          <p className="text-sm font-semibold text-gray-900 mt-0.5 truncate">{p.projectName}</p>
          <p className="text-xs text-gray-500">{p.clientName}</p>
        </div>
        <Button size="sm" variant="secondary" loading={advancing} onClick={advance}>
          Advance →
        </Button>
      </div>
      {err && <div className="px-4 pb-3"><p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{err}</p></div>}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
          {!detail && <p className="text-xs text-gray-400">Loading tasks…</p>}
          {detail && incompleteTasks.length === 0 && (
            <p className="text-xs text-green-600">All tasks complete — ready to advance.</p>
          )}
          {detail && incompleteTasks.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500 mb-2">{incompleteTasks.length} blocking task{incompleteTasks.length !== 1 ? 's' : ''}:</p>
              {incompleteTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-xs text-gray-700">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.status === 'In Progress' ? 'bg-blue-400' : 'bg-gray-300'}`} />
                  <span className="truncate">{t.taskName}</span>
                  <span className="shrink-0 text-gray-400">{t.department?.join(', ')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function PhasesPage() {
  const { data, isLoading, mutate } = useSWR<{ projects: Project[] }>(
    '/api/projects?all=true', fetcher, { refreshInterval: 300_000 },
  )
  const projects = (data?.projects ?? []).filter(
    (p) => !['Closed', 'Closed and active warranty', 'Warranty expired', 'Not-Approved'].includes(p.projectStage),
  )

  async function handleAdvance(id: string) {
    const res = await fetch(`/api/projects/${id}/advance`, { method: 'POST' })
    if (!res.ok) {
      const d = await res.json()
      throw new Error(
        d.blockingTasks
          ? `${d.error}: ${d.blockingTasks.map((t: { taskName: string }) => t.taskName).join(', ')}`
          : d.error ?? 'Failed',
      )
    }
    mutate()
  }

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Phase Gates</h2>
        <p className="text-sm text-gray-500">Advance projects through stages. All tasks in the current stage must be completed.</p>
      </div>
      {projects.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-10">No active projects.</p>
      )}
      {projects.map((p) => (
        <PhaseGateCard key={p.id} project={p} onAdvance={handleAdvance} />
      ))}
    </div>
  )
}
