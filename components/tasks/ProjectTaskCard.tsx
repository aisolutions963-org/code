'use client'

import { useRouter } from 'next/navigation'

const STAGE_BADGE: Record<string, string> = {
  Preparing: 'bg-orange-100 text-orange-700 border-orange-200',
  Open: 'bg-teal-100 text-teal-700 border-teal-200',
  Production: 'bg-purple-100 text-purple-700 border-purple-200',
  Closed: 'bg-green-100 text-green-700 border-green-200',
}

const ACCENT: Record<string, string> = {
  Preparing: 'border-l-orange-400',
  Open: 'border-l-teal-400',
  Production: 'border-l-purple-400',
  Closed: 'border-l-green-400',
}

interface ProjectTaskCardProps {
  projectRef: string
  projectRecordId?: string
  projectName?: string
  projectNickname?: string
  projectStage?: string
  /** Working sub-stage (Material/Fabrication/Fixing) — shown next to a Production badge. */
  subStage?: string | null
  taskCount: number
  itemCount: number
  pendingApprovalCount: number
  priorityCount?: number
  /** Tasks the current role can act on now — drives the green "active" glow + pill. */
  activeCount?: number
  /** Names of the assigned installation team members, if any. */
  installationTeamNames?: string[]
  isPhase2: boolean
}

export default function ProjectTaskCard({
  projectRef,
  projectRecordId,
  projectName,
  projectNickname,
  projectStage,
  subStage,
  taskCount,
  itemCount,
  pendingApprovalCount,
  priorityCount = 0,
  activeCount = 0,
  installationTeamNames = [],
  isPhase2,
}: ProjectTaskCardProps) {
  const router = useRouter()
  const stage = projectStage ?? (isPhase2 ? 'Open' : '')
  const accentClass = ACCENT[stage] ?? 'border-l-gray-300'
  const stageBadgeClass = STAGE_BADGE[stage]
  const displayName = projectNickname ?? projectName
  const hasActive = activeCount > 0

  // A green "active" ring means "there's something here for you to do now" — it takes
  // precedence over the teal Phase-2 treatment so actionable projects stand out.
  const outerClass = hasActive
    ? `border border-green-300 border-l-4 ${accentClass} rounded-xl overflow-hidden ring-2 ring-green-400 shadow-[0_0_0_4px_rgba(74,222,128,0.15)]`
    : isPhase2
    ? `border border-teal-200 border-l-4 ${accentClass} rounded-xl overflow-hidden shadow-[0_0_0_3px_rgba(20,184,166,0.12)]`
    : `border border-gray-200 border-l-4 ${accentClass} rounded-xl overflow-hidden shadow-sm`

  const headerBg = isPhase2
    ? 'bg-gradient-to-r from-teal-50 to-white hover:from-teal-100 active:from-teal-200'
    : 'bg-white hover:bg-gray-50 active:bg-gray-100'

  const inner = (
    <div className={`flex items-center gap-3 px-4 py-3.5 ${headerBg} transition-colors w-full`}>
      {isPhase2 && (
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500" />
        </span>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-bold text-gray-800 truncate">
            {displayName ?? projectRef}
          </span>
          {stageBadgeClass && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium border ${stageBadgeClass}`}>
              {stage}{subStage ? ` · ${subStage}` : ''}
            </span>
          )}
        </div>
        {displayName && projectRef && (
          <p className="text-xs text-gray-400 font-mono uppercase tracking-wider mt-0.5">{projectRef}</p>
        )}
        {installationTeamNames.length > 0 && (
          <p className="text-[11px] text-violet-600 mt-0.5 truncate">
            👷 {installationTeamNames.join(', ')}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
        {hasActive && (
          <span className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-300 px-1.5 py-0.5 rounded-full" title="Tasks waiting for you">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
            {activeCount} for you
          </span>
        )}
        {priorityCount > 0 && (
          <span className="flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full" title="Priority tasks">
            🚩 {priorityCount}
          </span>
        )}
        {pendingApprovalCount > 0 && (
          <span className="flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
            {pendingApprovalCount} pending
          </span>
        )}
        {isPhase2 && itemCount > 0 && (
          <span className="text-xs text-teal-600 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded-full font-medium">
            {itemCount} item{itemCount !== 1 ? 's' : ''}
          </span>
        )}
        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
          {taskCount} task{taskCount !== 1 ? 's' : ''}
        </span>
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  )

  if (projectRecordId) {
    return (
      <div
        className={`${outerClass} cursor-pointer`}
        onClick={() => router.push(`/dashboard/project/${projectRecordId}`)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && router.push(`/dashboard/project/${projectRecordId}`)}
      >
        {inner}
      </div>
    )
  }

  return <div className={outerClass}>{inner}</div>
}
