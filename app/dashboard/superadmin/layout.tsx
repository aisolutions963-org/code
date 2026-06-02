import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role !== 'superadmin') redirect('/home')
  return <>{children}</>
}
