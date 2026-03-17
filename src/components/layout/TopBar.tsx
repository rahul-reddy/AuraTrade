'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Search, Layers } from 'lucide-react'

// ─── Context label ─────────────────────────────────────────────────────────────
// For chart pages: show the symbol (e.g. "AAPL").
// For all other pages: show the active account name — genuinely useful context
// that the page content doesn't already repeat.

function getContextLabel(pathname: string, accountName: string): string {
  if (pathname.startsWith('/chart/')) {
    const symbol = pathname.split('/chart/')[1]?.split('/')[0] ?? ''
    return decodeURIComponent(symbol).toUpperCase()
  }
  return accountName
}

// ─── Component ────────────────────────────────────────────────────────────────

interface TopBarProps {
  onOpenPalette: () => void
  accountName: string
}

export default function TopBar({ onOpenPalette, accountName }: TopBarProps) {
  const pathname = usePathname()
  const contextLabel = getContextLabel(pathname, accountName)

  // Detect platform on the client to show the correct modifier key
  const [modKey, setModKey] = useState('⌘K')
  useEffect(() => {
    if (!navigator.platform.toUpperCase().includes('MAC')) {
      setModKey('Ctrl K')
    }
  }, [])

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-5 backdrop-blur">
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Layers className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium text-zinc-300">{contextLabel}</span>
      </div>

      <button
        type="button"
        onClick={onOpenPalette}
        className="flex items-center gap-2 rounded-lg border border-zinc-700/60 bg-zinc-800/50 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Search…</span>
        <kbd className="ml-1 rounded bg-zinc-700 px-1.5 py-0.5 font-mono text-[10px] leading-none text-zinc-400">
          {modKey}
        </kbd>
      </button>
    </header>
  )
}
