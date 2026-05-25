'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Project } from '@/lib/types'
import PipelineColumn from '@/components/pipeline/PipelineColumn'
import TimelineStrip from '@/components/pipeline/TimelineStrip'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const COLUMNS: { title: string; stages: string[] }[] = [
  { title: 'Inquiry',  stages: ['Inquiry'] },
  { title: 'Quotation', stages: ['Quotation Sent', 'Quotation Approved', 'Quotation Rejected', 'On Hold'] },
  { title: 'Phase 1',  stages: ['Preparing'] },
  { title: 'Phase 2',  stages: ['Open'] },
  { title: 'Phase 3',  stages: ['Working'] },
  { title: 'Handover', stages: ['Handover', 'Handing Over'] },
  { title: 'Done',     stages: ['Closed', 'Cancelled'] },
]

export default function PipelineClient() {
  const [search, setSearch] = useState('')
  const { data, isLoading } = useSWR<{ projects: Project[] }>(
    '/api/projects?all=true',
    fetcher,
    { refreshInterval: 60000 },
  )

  const projects = useMemo(() => {
    const all = data?.projects ?? []
    if (!search.trim()) return all
    const q = search.toLowerCase()
    return all.filter(
      (p) =>
        p.projectName.toLowerCase().includes(q) ||
        p.clientName.toLowerCase().includes(q) ||
        p.projectId?.toLowerCase().includes(q),
    )
  }, [data, search])

  const columnData = useMemo(() =>
    COLUMNS.map((col) => ({
      ...col,
      projects: projects.filter((p) => col.stages.includes(p.projectStage)),
    })),
  [projects])

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-white/[0.05]">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="w-full pl-9 pr-4 py-2 rounded-xl text-sm text-white/80 placeholder-white/25
              bg-white/[0.05] border border-white/[0.08] focus:outline-none focus:border-white/20
              focus:bg-white/[0.07] transition-all"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          ) : (
            <span className="text-xs text-white/30">{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      {/* Kanban */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-4 h-full px-5 py-4" style={{ minWidth: 'max-content' }}>
          {columnData.map((col) => (
            <PipelineColumn key={col.title} title={col.title} projects={col.projects} />
          ))}
        </div>
      </div>

      {/* Timeline */}
      <TimelineStrip />
    </div>
  )
}
