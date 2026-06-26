'use client'

import UnifiedCalendar, { TabDef } from '@/components/calendar/UnifiedCalendar'
import { useSession } from '@/app/dashboard/layout-client'

export default function CalendarPage() {
  const { name } = useSession()

  const tabs: TabDef[] = [
    { id: 'all',          label: 'All',               dot: 'bg-gray-400',    types: null,                                                                    noAdd: true },
    { id: 'activity',     label: 'Project Activity',  dot: 'bg-blue-500',    types: ['activity', 'fabrication'],                                             canAddEvent: true },
    { id: 'payments',     label: 'Payments',          dot: 'bg-red-400',     types: ['payment-received', 'payment-due'],                                      noAdd: true },
    { id: 'personal',     label: 'My Activities',     dot: 'bg-yellow-400',  types: ['personal'], creatorFilter: name ?? undefined, personalMode: true,       canAddEvent: true },
    { id: 'installation', label: 'Installation',      dot: 'bg-purple-500',  types: ['installation', 'fabrication', 'delivery'], showInstallAssign: true,     canAddEvent: true },
    { id: 'materials',    label: 'Material Delivery', dot: 'bg-orange-400',  types: ['delivery'],                                                             noAdd: true },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Calendars</h2>
        <p className="text-sm text-gray-500">All project and operational timelines in one place</p>
      </div>
      <UnifiedCalendar tabs={tabs} />
    </div>
  )
}
