'use client'

import { Project } from '@/lib/types'
import { useDrawer } from '@/lib/drawer-context'
import Link from 'next/link'

const STAGE_DOT: Record<string, string> = {
  'Preparing': 'bg-purple-400',
  'Open': 'bg-amber-400',
  'Production': 'bg-green-400',
  'Closed': 'bg-gray-600',
  'Closed and active warranty': 'bg-teal-400',
  'Warranty expired': 'bg-gray-400',
}

function urgencyGlow(project: Project): string {
  if (!project.lastModifiedTasks) return ''
  const daysSince = (Date.now() - new Date(project.lastModifiedTasks).getTime()) / 86400000
  if (daysSince > 5) return 'glow-ring-red'
  if (daysSince > 3) return 'glow-ring-amber'
  return ''
}

function ProjectDetailContent({ project }: { project: Project }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1">Project</p>
        <h3 className="text-lg font-semibold text-white/90">{project.projectName}</h3>
        {project.nickname && <p className="text-sm text-white/40 mt-0.5">"{project.nickname}"</p>}
        <p className="text-xs text-white/40 mt-1 font-mono">{project.projectId}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-[10px] text-white/30 uppercase tracking-widest mb-0.5">Client</p>
          <p className="text-sm text-white/80 font-medium">{project.clientName}</p>
          {project.clientPhone && <p className="text-xs text-white/40 mt-0.5">{project.clientPhone}</p>}
        </div>
        <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-[10px] text-white/30 uppercase tracking-widest mb-0.5">Stage</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`w-2 h-2 rounded-full ${STAGE_DOT[project.projectStage] ?? 'bg-gray-500'}`} />
            <p className="text-sm text-white/80 font-medium">{project.projectStage}</p>
          </div>
        </div>
        {project.emirate && (
          <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-[10px] text-white/30 uppercase tracking-widest mb-0.5">Location</p>
            <p className="text-sm text-white/80">{project.emirate}{project.location ? ` · ${project.location}` : ''}</p>
          </div>
        )}
        {project.paymentMode && (
          <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-[10px] text-white/30 uppercase tracking-widest mb-0.5">Payment</p>
            <p className="text-sm text-white/80">{project.paymentMode}</p>
          </div>
        )}
      </div>

      {project.projectTotalCost != null && (
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-white/30 uppercase tracking-widest">Payment Progress</p>
            <p className="text-xs text-white/50">
              AED {(project.totalPaid ?? 0).toLocaleString()} / {project.projectTotalCost.toLocaleString()}
            </p>
          </div>
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${Math.min(100, project.paymentProgress ?? 0)}%` }}
            />
          </div>
        </div>
      )}

      {project.projectDescription && (
        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1">Description</p>
          <p className="text-sm text-white/50 leading-relaxed">{project.projectDescription}</p>
        </div>
      )}

      <Link
        href={`/dashboard/project/${project.id}`}
        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl
          bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.08]
          text-sm text-white/70 hover:text-white/90 transition-all"
      >
        Open Project Page
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </Link>
    </div>
  )
}

export default function PipelineProjectCard({ project }: { project: Project }) {
  const { openDrawer } = useDrawer()
  const dot = STAGE_DOT[project.projectStage] ?? 'bg-gray-500'
  const glow = urgencyGlow(project)

  return (
    <button
      onClick={() => openDrawer(project.projectName, <ProjectDetailContent project={project} />)}
      className={`w-full text-left rounded-2xl p-4 border border-white/[0.08] transition-all duration-200
        hover:border-white/[0.15] hover:scale-[1.01] hover:shadow-lg group cursor-pointer ${glow}`}
      style={{ background: 'rgba(24,24,40,0.80)' }}
    >
      {/* Title row */}
      <div className="flex items-start gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${dot}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white/90 leading-snug line-clamp-2 group-hover:text-white transition-colors">
            {project.projectName}
          </p>
          <p className="text-[11px] text-white/35 mt-0.5">
            {project.clientName}
            {project.emirate ? ` · ${project.emirate}` : ''}
          </p>
        </div>
      </div>

      <div className="h-px bg-white/[0.05] my-2.5" />

      {/* Progress bar */}
      {project.projectTotalCost != null ? (
        <div className="mb-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-white/30">Payment</span>
            <span className="text-[10px] text-white/40 font-mono">
              {Math.round(project.paymentProgress ?? 0)}%
            </span>
          </div>
          <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500/80 rounded-full"
              style={{ width: `${Math.min(100, project.paymentProgress ?? 0)}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/25 font-mono">{project.projectId}</span>
        {project.lastModifiedTasks && (
          <span className="text-[10px] text-white/25">
            {new Date(project.lastModifiedTasks).toLocaleDateString('en-AE', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
    </button>
  )
}
