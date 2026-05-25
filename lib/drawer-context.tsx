'use client'

import { createContext, useContext, useState, useCallback } from 'react'

interface DrawerState {
  open: boolean
  title: string
  content: React.ReactNode
}

interface DrawerContextValue {
  openDrawer: (title: string, content: React.ReactNode) => void
  closeDrawer: () => void
  state: DrawerState
}

const DrawerCtx = createContext<DrawerContextValue | null>(null)

export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DrawerState>({ open: false, title: '', content: null })

  const openDrawer = useCallback((title: string, content: React.ReactNode) => {
    setState({ open: true, title, content })
  }, [])

  const closeDrawer = useCallback(() => {
    setState((s) => ({ ...s, open: false }))
  }, [])

  return (
    <DrawerCtx.Provider value={{ openDrawer, closeDrawer, state }}>
      {children}
    </DrawerCtx.Provider>
  )
}

export function useDrawer() {
  const ctx = useContext(DrawerCtx)
  if (!ctx) throw new Error('useDrawer must be used inside DrawerProvider')
  return ctx
}
