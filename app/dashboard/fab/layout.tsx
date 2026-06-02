import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function FabLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['fabrication', 'superadmin'].includes(session.role)) redirect('/home')
  return <>{children}</>
}
