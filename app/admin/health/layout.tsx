import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getDeploymentInfo } from '@/lib/env'
import DashboardLayoutClient from '@/app/dashboard/layout-client'

export default async function AdminHealthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role !== 'superadmin') redirect('/dashboard/superadmin')
  const { isProduction, branch } = getDeploymentInfo()
  return (
    <DashboardLayoutClient role="superadmin" name={session.name} isProduction={isProduction} branch={branch}>
      {children}
    </DashboardLayoutClient>
  )
}
