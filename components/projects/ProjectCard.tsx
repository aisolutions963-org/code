import Link from 'next/link'
import { Project } from '@/lib/types'
import PaymentBar from './PaymentBar'
import Badge from '@/components/ui/Badge'

const STAGE_VARIANT: Record<string, 'blue' | 'green' | 'gray' | 'orange'> = {
  Preparing: 'orange',
  Open: 'blue',
  Closing: 'blue',
  Closed: 'green',
}

interface ProjectCardProps {
  project: Project
  showPayments?: boolean
  children?: React.ReactNode
}

export default function ProjectCard({ project, showPayments = false, children }: ProjectCardProps) {
  const stageVariant = STAGE_VARIANT[project.projectStage] ?? 'gray'

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-gray-400">{project.projectId}</span>
            <Badge variant={stageVariant}>{project.projectStage}</Badge>
          </div>
          <h3 className="text-sm font-semibold text-gray-900 mt-0.5 truncate">
            {project.projectName}
            {project.nickname && (
              <span className="ml-1.5 text-xs font-normal text-gray-400">({project.nickname})</span>
            )}
          </h3>
          {project.clientName && (
            <p className="text-xs text-gray-500">{project.clientName}</p>
          )}
        </div>
      </div>

      {showPayments && project.projectTotalCost != null && (
        <PaymentBar project={project} />
      )}

      {project.projectStage === 'Open' && (
        <Link
          href={`/dashboard/project/${project.id}`}
          className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 font-medium"
        >
          View Item Board
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}

      {children}
    </div>
  )
}
