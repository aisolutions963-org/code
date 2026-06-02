import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function SedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['sed', 'manager', 'superadmin'].includes(session.role)) redirect('/home')
  return <>{children}</>
}
