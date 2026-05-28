'use client'

import { createContext, useContext, Suspense } from 'react'
import IconSidebar from '@/components/layout/IconSidebar'
import GlassTopBar from '@/components/layout/GlassTopBar'
import MobileBottomNav from '@/components/layout/MobileBottomNav'
import ContextDrawer from '@/components/layout/ContextDrawer'
import { DrawerProvider } from '@/lib/drawer-context'
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
      <DrawerProvider>
        <div className="flex h-screen overflow-hidden bg-gray-50">
          {/* Desktop sidebar — hidden on mobile */}
          <Suspense fallback={null}>
            <IconSidebar role={role} name={name} />
          </Suspense>

          {/* Main column */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-50">
            <GlassTopBar role={role} name={name} />

            {/* Content — pb-16 on mobile reserves space above bottom nav */}
            <main className="flex-1 overflow-y-auto scrollbar-thin pb-16 md:pb-0">
              {children}
            </main>
          </div>

          <ContextDrawer />
        </div>

        {/* Mobile bottom nav — only visible on small screens */}
        <Suspense fallback={null}>
          <MobileBottomNav role={role} name={name} />
        </Suspense>
      </DrawerProvider>
    </SessionContext.Provider>
  )
}
