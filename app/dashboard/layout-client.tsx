'use client'

import { createContext, useContext } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import TopBar from '@/components/layout/TopBar'
import { Role } from '@/lib/types'

interface SessionCtx {
  role: Role
  name: string
}

const SessionContext = createContext<SessionCtx | null>(null)

export function useSession(): SessionCtx {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within DashboardLayoutClient')
  return ctx
}

export default function DashboardLayoutClient({
  role,
  name,
  children,
}: {
  role: Role
  name: string
  children: React.ReactNode
}) {
  return (
    <SessionContext.Provider value={{ role, name }}>
      <div className="flex h-screen overflow-hidden bg-gray-100">
        <Sidebar role={role} />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar role={role} name={name} />
          <main className="flex-1 overflow-y-auto scrollbar-thin">
            {children}
          </main>
        </div>
      </div>
    </SessionContext.Provider>
  )
}
