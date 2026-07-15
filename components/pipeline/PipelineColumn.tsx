'use client'

import { Project } from '@/lib/types'
import PipelineProjectCard from './PipelineProjectCard'

const COLUMN_GLOW: Record<string, string> = {
  Preparing:  'border-orange-500/20',
  Open:       'border-blue-500/20',
  Production: 'border-purple-500/20',
  Closing:    'border-gray-600/20',
}

const COLUMN_DOT: Record<string, string> = {
  Preparing:  'bg-orange-400',
  Open:       'bg-blue-400',
  Production: 'bg-purple-400',
  Closing:    'bg-gray-600',
}

const COLUMN_BADGE: Record<string, string> = {
  Preparing:  'bg-orange-500/15 text-orange-300',
  Open:       'bg-blue-500/15 text-blue-300',
  Production: 'bg-purple-500/15 text-purple-300',
  Closing:    'bg-gray-600/15 text-gray-400',
}

export default function PipelineColumn({
  title,
  projects,
}: {
  title: string
  projects: Project[]
}) {
  const borderClass = COLUMN_GLOW[title] ?? 'border-white/10'
  const dotClass = COLUMN_DOT[title] ?? 'bg-gray-500'
  const badgeClass = COLUMN_BADGE[title] ?? 'bg-white/10 text-white/50'

  return (
    <div className={`w-72 shrink-0 flex flex-col rounded-2xl border ${borderClass} overflow-hidden`}
      style={{ background: 'rgba(18,18,32,0.60)' }}>
      {/* Column header */}
      <div className="flex items-center gap-2 px-4 py-3.5 border-b border-white/[0.05]">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
        <span className="text-sm font-semibold text-white/80 flex-1">{title}</span>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
          {projects.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2.5">
        {projects.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-xs text-white/20">Empty</p>
          </div>
        ) : (
          projects.map((p) => <PipelineProjectCard key={p.id} project={p} />)
        )}
      </div>
    </div>
  )
}
