import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ClientRequestsClient from './client-requests-client'

export default async function ClientRequestsPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['sed', 'manager', 'superadmin'].includes(session.role)) redirect('/home')
  return <ClientRequestsClient role={session.role} />
}
