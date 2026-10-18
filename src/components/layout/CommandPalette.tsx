'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  LineChart,
  Upload,
  TrendingUp,
  TrendingDown,
  Settings,
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
          <CommandItem onSelect={() => navigate('/settings/integrity')}>
            <Settings className="mr-2 h-4 w-4 text-zinc-400" />
            Settings: Data Integrity
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Filter Trades">
          <CommandItem onSelect={() => navigate('/trades?status=closed&direction=LONG')}>
            <TrendingUp className="mr-2 h-4 w-4 text-profit" />
            View Long Trades
          </CommandItem>
          <CommandItem onSelect={() => navigate('/trades?status=closed&direction=SHORT')}>
            <TrendingDown className="mr-2 h-4 w-4 text-loss" />
            View Short Trades
          </CommandItem>
          <CommandItem onSelect={() => navigate('/trades?status=open')}>
            <LineChart className="mr-2 h-4 w-4 text-primary" />
            View Open Positions
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
