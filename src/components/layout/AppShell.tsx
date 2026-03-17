'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AnimatePresence, motion, type Transition } from 'framer-motion'
import AppSidebar from '@/components/layout/AppSidebar'
import TopBar from '@/components/layout/TopBar'
import CommandPalette from '@/components/layout/CommandPalette'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppShellProps {
  children: React.ReactNode
  userEmail: string
  accountName: string
}

// ─── Page transition variants ─────────────────────────────────────────────────

const pageVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
}

const pageTransition: Transition = {
  duration: 0.18,
  ease: 'easeOut',
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

/**
 * Global keyboard shortcuts:
 *  g d  → /dashboard
 *  g t  → /trades
 *  g c  → /chart (no-op without symbol, skipped)
 *  u    → /upload
 *  ⌘K   → command palette
 *
 * Sequence shortcuts (g+key) have a 1.5s window after pressing g.
 * Shortcuts are suppressed when focus is in an input/textarea/select.
 */
function useKeyboardShortcuts(onOpenPalette: () => void) {
  const router = useRouter()
  const pendingG = useRef(false)
  const gTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearG = useCallback(() => {
    pendingG.current = false
    if (gTimer.current) {
      clearTimeout(gTimer.current)
      gTimer.current = null
    }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Suppress in form elements
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return
      }

      // Cmd/Ctrl + K → palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onOpenPalette()
        clearG()
        return
      }

      // Sequence: g + key
      if (pendingG.current) {
        clearG()
        switch (e.key) {
          case 'd':
            e.preventDefault()
            router.push('/dashboard')
            break
          case 't':
            e.preventDefault()
            router.push('/trades')
            break
          case 'c':
            e.preventDefault()
            router.push('/trades') // fallback: no symbol context here
            break
        }
        return
      }

      // Single-key shortcuts
      switch (e.key) {
        case 'g':
          e.preventDefault()
          pendingG.current = true
          gTimer.current = setTimeout(clearG, 1500)
          break
        case 'u':
          e.preventDefault()
          router.push('/upload')
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      clearG()
    }
  }, [router, onOpenPalette, clearG])
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AppShell({ children, userEmail, accountName }: AppShellProps) {
  const pathname = usePathname()
  const [paletteOpen, setPaletteOpen] = useState(false)

  const openPalette = useCallback(() => setPaletteOpen(true), [])
  const closePalette = useCallback(() => setPaletteOpen(false), [])

  useKeyboardShortcuts(openPalette)

  return (
    <div className="flex h-screen w-full overflow-hidden bg-zinc-950 text-white">
      <AppSidebar userEmail={userEmail} accountName={accountName} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenPalette={openPalette} />

        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={pageTransition}
              className="h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </div>
  )
}
