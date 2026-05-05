import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import DashboardLayoutClient from '@/app/dashboard/layout-client'

export default async function AdminHealthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role !== 'superadmin') redirect('/dashboard/superadmin')
  return (
    <DashboardLayoutClient role="superadmin" name={session.name}>
      {children}
    </DashboardLayoutClient>
  )
}
