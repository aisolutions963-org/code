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
  isProduction,
  branch,
  children,
}: {
  role: Role
  name: string
  isProduction: boolean
  branch?: string
  children: React.ReactNode
}) {
  return (
    <SessionContext.Provider value={{ role, name }}>
      <DrawerProvider>
        <div className="h-screen flex flex-col overflow-hidden bg-gray-50">
          {!isProduction && (
            <div className="shrink-0 bg-amber-500 text-white text-center text-[11px] font-bold tracking-widest uppercase py-1">
              {branch ? `Preview — ${branch}` : 'Preview / Local Environment'} — not production
            </div>
          )}

          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Desktop sidebar — hidden on mobile */}
            <Suspense fallback={
              <aside
                className="w-52 shrink-0 h-full hidden md:block"
                style={{ background: 'rgba(14,14,24,0.97)', borderRight: '1px solid rgba(255,255,255,0.07)' }}
              />
            }>
              <IconSidebar role={role} name={name} />
            </Suspense>

            {/* Main column */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-50">
              <GlassTopBar role={role} name={name} />

              {/* Content — reserve the bottom-nav height (64px) + device safe-area on mobile
                  so the last buttons aren't hidden behind the fixed nav bar. */}
              <main className="flex-1 overflow-y-auto scrollbar-thin md:pb-0 pb-[calc(4.5rem_+_env(safe-area-inset-bottom))]">
                <Suspense fallback={null}>
                  {children}
                </Suspense>
              </main>
            </div>

            <ContextDrawer />
          </div>
        </div>

        {/* Mobile bottom nav — only visible on small screens */}
        <Suspense fallback={null}>
          <MobileBottomNav role={role} name={name} />
        </Suspense>
      </DrawerProvider>
    </SessionContext.Provider>
  )
}
