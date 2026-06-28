import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import FormsClient from './FormsClient'

export const dynamic = 'force-dynamic'

export default async function FormsPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  return <FormsClient role={session.role} />
}
