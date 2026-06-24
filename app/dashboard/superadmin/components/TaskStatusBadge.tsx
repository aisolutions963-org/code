'use client'

import Badge from '@/components/ui/Badge'

export default function TaskStatusBadge({ status }: { status: string }) {
  const map: Record<string, 'blue' | 'green' | 'orange' | 'gray' | 'red'> = {
    'In Progress': 'blue',
    Completed: 'green',
    'Pending Approval': 'orange',
    'To Do': 'gray',
    Locked: 'gray',
  }
  return <Badge variant={map[status] ?? 'gray'}>{status}</Badge>
}
