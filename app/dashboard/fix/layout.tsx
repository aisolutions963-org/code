import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function FixLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['installation', 'superadmin'].includes(session.role)) redirect('/home')
  return <>{children}</>
}
