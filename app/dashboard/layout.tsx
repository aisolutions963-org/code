import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import DashboardLayoutClient from './layout-client'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) {
    redirect('/login')
  }

  return (
    <DashboardLayoutClient role={session.role} name={session.name}>
      {children}
    </DashboardLayoutClient>
  )
}
