'use client'

import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  LineChart,
  Upload,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter()

  const navigate = useCallback(
    (href: string) => {
      onClose()
      router.push(href)
    },
    [onClose, router],
  )

  // Cmd+K / Ctrl+K to open (handled by parent, but re-close on Escape handled by dialog itself)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        // toggled by parent
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <CommandDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <CommandInput placeholder="Search pages and actions…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => navigate('/dashboard')}>
            <LayoutDashboard className="mr-2 h-4 w-4 text-zinc-400" />
            Dashboard
            <span className="ml-auto text-xs text-zinc-500">g d</span>
          </CommandItem>
          <CommandItem onSelect={() => navigate('/trades')}>
            <LineChart className="mr-2 h-4 w-4 text-zinc-400" />
            Trades
            <span className="ml-auto text-xs text-zinc-500">g t</span>
          </CommandItem>
          <CommandItem onSelect={() => navigate('/upload')}>
            <Upload className="mr-2 h-4 w-4 text-zinc-400" />
            Upload CSV
            <span className="ml-auto text-xs text-zinc-500">u</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Filter Trades">
          <CommandItem onSelect={() => navigate('/trades?status=closed&direction=LONG')}>
            <TrendingUp className="mr-2 h-4 w-4 text-green-500" />
            View Long Trades
          </CommandItem>
          <CommandItem onSelect={() => navigate('/trades?status=closed&direction=SHORT')}>
            <TrendingDown className="mr-2 h-4 w-4 text-red-400" />
            View Short Trades
          </CommandItem>
          <CommandItem onSelect={() => navigate('/trades?status=open')}>
            <LineChart className="mr-2 h-4 w-4 text-blue-400" />
            View Open Positions
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
