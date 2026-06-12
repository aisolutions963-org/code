import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import PipelineClient from './pipeline-client'

export default async function PipelinePage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['manager', 'superadmin'].includes(session.role)) redirect('/home')
  return <PipelineClient role={session.role} />
}
