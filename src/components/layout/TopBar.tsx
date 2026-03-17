'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'

// ─── Page title map ───────────────────────────────────────────────────────────

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/trades': 'Trade History',
  '/upload': 'Import Trades',
  '/settings': 'Settings',
}

function getPageTitle(pathname: string): string {
  for (const [prefix, title] of Object.entries(PAGE_TITLES)) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return title
  }
  if (pathname.startsWith('/chart/')) return 'Chart'
  return 'AuraTrade'
}

// ─── Component ────────────────────────────────────────────────────────────────

interface TopBarProps {
  onOpenPalette: () => void
}

export default function TopBar({ onOpenPalette }: TopBarProps) {
  const pathname = usePathname()
  const title = getPageTitle(pathname)

  // Detect platform on the client to show the correct modifier key
  const [modKey, setModKey] = useState('⌘K')
  useEffect(() => {
    if (!navigator.platform.toUpperCase().includes('MAC')) {
      setModKey('Ctrl K')
    }
  }, [])

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-5 backdrop-blur">
      <p className="text-sm font-semibold text-zinc-100">{title}</p>

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
