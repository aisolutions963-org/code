import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getDeploymentInfo } from '@/lib/env'
import DashboardLayoutClient from '@/app/dashboard/layout-client'

export default async function HomeLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) {
    redirect('/login')
  }

  const { isProduction, branch } = getDeploymentInfo()

  return (
    <DashboardLayoutClient role={session.role} name={session.name} isProduction={isProduction} branch={branch}>
      {children}
    </DashboardLayoutClient>
  )
}
