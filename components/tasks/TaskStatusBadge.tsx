import { TaskStatus } from '@/lib/types'

const STATUS_STYLES: Record<TaskStatus, string> = {
  'To Do': 'bg-yellow-100 text-yellow-800',
  'In Progress': 'bg-blue-100 text-blue-800',
  'Completed': 'bg-green-100 text-green-800',
  'Pending Approval': 'bg-orange-100 text-orange-800',
  'Locked': 'bg-gray-100 text-gray-500',
}

const STATUS_DOTS: Record<TaskStatus, string> = {
  'To Do': 'bg-yellow-400',
  'In Progress': 'bg-blue-500',
  'Completed': 'bg-green-500',
  'Pending Approval': 'bg-orange-400',
  'Locked': 'bg-gray-400',
}

export default function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOTS[status]}`} />
      {status}
    </span>
  )
}
