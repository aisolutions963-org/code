'use client'

import { useEffect, useRef } from 'react'
import { useDrawer } from '@/lib/drawer-context'

export default function ContextDrawer() {
  const { state, closeDrawer } = useDrawer()
  const drawerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeDrawer()
    }
    if (state.open) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [state.open, closeDrawer])

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={closeDrawer}
        className={`fixed inset-0 bg-black/50 backdrop-blur-[2px] z-40 transition-opacity duration-300 ${
          state.open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Panel */}
      <div
        ref={drawerRef}
        className={`fixed right-0 top-0 h-screen w-full sm:w-[500px] z-50 flex flex-col
          border-l border-white/[0.08]
          transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          state.open ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ background: 'rgba(16,16,28,0.98)', backdropFilter: 'blur(24px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-14 px-5 shrink-0 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-white/90">{state.title}</h2>
          <button
            onClick={closeDrawer}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-white/40
              hover:text-white/80 hover:bg-white/[0.06] transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
          {state.open && state.content}
        </div>
      </div>
    </>
  )
}
