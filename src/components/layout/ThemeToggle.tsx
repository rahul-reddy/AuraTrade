'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/components/providers/useTheme'

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
  return (
    <button
      type="button"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-card text-foreground transition-colors hover:border-primary hover:text-primary"
    >
      {theme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  )
}
