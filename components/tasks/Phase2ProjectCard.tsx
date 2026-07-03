'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Phase2ProjectCardProps {
  projectRef: string
  projectRecordId?: string
  projectName?: string
  projectNickname?: string
  taskCount: number
  itemCount: number
  children: React.ReactNode
}

export default function Phase2ProjectCard({
  projectRef,
  projectRecordId,
  projectName,
  projectNickname,
  taskCount,
  itemCount,
  children,
}: Phase2ProjectCardProps) {
  const [expanded, setExpanded] = useState(true)

  const displayName = projectNickname ?? projectName

  return (
    <div className="border border-teal-200 rounded-xl overflow-hidden shadow-[0_0_0_3px_rgba(20,184,166,0.15)]">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-teal-50 to-white hover:from-teal-100 transition-colors text-left"
      >
        {/* Pulsing active dot */}
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500" />
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-gray-800 truncate">
              {displayName ?? projectRef}
            </span>
            <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-medium">
              Open
            </span>
          </div>
          {displayName && projectRef && (
            <p className="text-xs text-gray-400 font-mono uppercase tracking-wider mt-0.5">{projectRef}</p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-gray-400">
            {itemCount} item{itemCount !== 1 ? 's' : ''} · {taskCount} task{taskCount !== 1 ? 's' : ''}
          </span>
          {projectRecordId && (
            <Link
              href={`/dashboard/project/${projectRecordId}`}
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-teal-600 hover:text-teal-800 font-medium whitespace-nowrap"
            >
              Item Board →
            </Link>
          )}
          <svg
            className={`w-4 h-4 text-teal-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-teal-100 p-3 space-y-2 bg-white">
          {children}
        </div>
      )}
    </div>
  )
}
