'use client'

import { useRouter } from 'next/navigation'

const STAGE_BADGE: Record<string, string> = {
  Preparing: 'bg-orange-100 text-orange-700 border-orange-200',
  Open: 'bg-teal-100 text-teal-700 border-teal-200',
  Closed: 'bg-green-100 text-green-700 border-green-200',
}

const ACCENT: Record<string, string> = {
  Preparing: 'border-l-orange-400',
  Open: 'border-l-teal-400',
  Closed: 'border-l-green-400',
}

interface ProjectTaskCardProps {
  projectRef: string
  projectRecordId?: string
  projectName?: string
  projectNickname?: string
  projectStage?: string
  taskCount: number
  itemCount: number
  pendingApprovalCount: number
  isPhase2: boolean
}

export default function ProjectTaskCard({
  projectRef,
  projectRecordId,
  projectName,
  projectNickname,
  projectStage,
  taskCount,
  itemCount,
  pendingApprovalCount,
  isPhase2,
}: ProjectTaskCardProps) {
  const router = useRouter()
  const stage = projectStage ?? (isPhase2 ? 'Open' : '')
  const accentClass = ACCENT[stage] ?? 'border-l-gray-300'
  const stageBadgeClass = STAGE_BADGE[stage]
  const displayName = projectNickname ?? projectName

  const outerClass = isPhase2
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
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider font-mono">
            {projectRef}
          </span>
          {stageBadgeClass && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium border ${stageBadgeClass}`}>
              {stage}
            </span>
          )}
        </div>
        {displayName && (
          <p className="text-xs text-gray-700 font-medium truncate mt-0.5">{displayName}</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
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
