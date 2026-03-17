'use client'

import { Component, useState, useEffect, useCallback, useRef } from 'react'
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
  // Zero-duration exit: old page unmounts immediately so the entering page is
  // the only one in the DOM, avoiding strict-mode heading selector collisions.
  exit: { opacity: 0, transition: { duration: 0 } },
}

const pageTransition: Transition = {
  duration: 0.15,
  ease: 'easeOut',
}

// ─── Shell error boundary ─────────────────────────────────────────────────────

interface ErrorBoundaryState {
  hasError: boolean
  message: string
}

class ShellErrorBoundary extends Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'An unexpected error occurred.',
    }
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center p-8">
          <div className="max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 text-center">
            <p className="text-sm font-semibold text-zinc-100">Something went wrong</p>
            <p className="mt-2 text-xs text-zinc-400">{this.state.message}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="mt-4 rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

/**
 * Global keyboard shortcuts:
 *  g d  → /dashboard
 *  g t  → /trades
 *  g c  → /trades (fallback — no symbol context at shell level)
 *  u    → /upload
 *  ⌘K / Ctrl+K → command palette
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
            router.push('/trades')
            break
        }
        return
      }

      // Single-key shortcuts — skip when any modifier is held so browser
      // combos like Ctrl+U (view source) or Cmd+G (find next) are not intercepted.
      if (e.metaKey || e.ctrlKey || e.altKey) return

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
        <TopBar onOpenPalette={openPalette} accountName={accountName} />

        <main className="flex-1 overflow-y-auto">
          <ShellErrorBoundary>
            {/* AnimatePresence without mode="wait" so main height never collapses */}
            <AnimatePresence initial={false}>
              <motion.div
                key={pathname}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={pageTransition}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </ShellErrorBoundary>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </div>
  )
}
