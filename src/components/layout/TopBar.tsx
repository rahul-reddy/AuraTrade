'use client'

import { usePathname } from 'next/navigation'
import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import ThemeToggle from '@/components/layout/ThemeToggle'
import { AmountPrivacyToggle } from '@/components/providers/AmountPrivacy'

// The platform never changes during a session, so there is nothing to subscribe to.
const subscribeNever = () => () => {}

/** Command-palette shortcut label for this client's platform (server renders ⌘K). */
function getClientModKey(): string {
  return navigator.platform.toUpperCase().includes('MAC') ? '⌘K' : 'Ctrl K'
}
import { Search, Layers, ChevronRight, Plus } from 'lucide-react'

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
  const modKey = useSyncExternalStore(subscribeNever, getClientModKey, () => '⌘K')

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950/90 px-4 sm:px-9">
      <div className="flex min-w-0 items-center gap-3 text-xs text-zinc-400">
        <Layers className="h-3.5 w-3.5 shrink-0" />
        <span className="max-w-48 truncate font-medium text-zinc-300">{contextLabel}</span>
        <ChevronRight className="hidden h-3 w-3 shrink-0 sm:block" />
        <span className="hidden text-zinc-400 sm:block">{pathname.startsWith('/chart/') ? 'Trade review' : pathname.startsWith('/weekly-review') ? 'Weekly review' : pathname.startsWith('/playbooks') ? 'Playbooks' : pathname.startsWith('/insights') ? 'Edge analysis' : pathname.startsWith('/review') ? 'Daily review' : pathname.startsWith('/trades') ? 'Trade history' : pathname.startsWith('/upload') ? 'Import center' : pathname.startsWith('/settings') ? 'Settings' : 'Performance'}</span>
      </div>

      <div className="flex shrink-0 items-center gap-3">
      <ThemeToggle />
      <AmountPrivacyToggle />
      <button
        type="button"
        onClick={onOpenPalette}
        aria-label="Search pages and commands"
        className="flex h-9 items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden md:inline">Jump to…</span>
        <kbd className="ml-3 hidden rounded border border-zinc-700 px-1.5 py-1 font-mono text-[10px] leading-none text-zinc-400 md:inline">
          {modKey}
        </kbd>
      </button>
      <Link href="/upload" className="action-primary hidden items-center gap-2 sm:inline-flex"><Plus size={15} />Import statement</Link>
      </div>
    </header>
  )
}
