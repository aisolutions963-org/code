'use client'

import { useSession } from '@/app/dashboard/layout-client'
import FormsClient from './FormsClient'

export default function FormsPage() {
  const { role } = useSession()
  return <FormsClient role={role} />
}
