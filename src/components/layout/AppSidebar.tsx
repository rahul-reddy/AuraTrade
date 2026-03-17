'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  LineChart,
  Upload,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  hint?: string
  disabled?: boolean
}

interface AppSidebarProps {
  userEmail: string
  accountName: string
}

// ─── Nav config ───────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    hint: 'g d',
  },
  {
    label: 'Trades',
    href: '/trades',
    icon: LineChart,
    hint: 'g t',
  },
  {
    label: 'Upload',
    href: '/upload',
    icon: Upload,
    hint: 'u',
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    disabled: true,
  },
]

// ─── KbdHint ─────────────────────────────────────────────────────────────────

function KbdHint({ hint }: { hint: string }) {
  return (
    <span className="ml-auto flex items-center gap-0.5">
      {hint.split(' ').map((key, i) => (
        <kbd
          key={i}
          className="rounded bg-zinc-700 px-1.5 py-0.5 font-mono text-[10px] leading-none text-zinc-400"
        >
          {key}
        </kbd>
      ))}
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AppSidebar({ userEmail, accountName }: AppSidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  // Persist collapsed state
  useEffect(() => {
    const stored = localStorage.getItem('sidebar-collapsed')
    if (stored === 'true') setCollapsed(true)
  }, [])

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      localStorage.setItem('sidebar-collapsed', String(!prev))
      return !prev
    })
  }

  return (
    <aside
      className={cn(
        'relative flex h-screen flex-col border-r border-zinc-800 bg-zinc-900/80 transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-[220px]',
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center gap-2.5 px-4 py-5', collapsed && 'justify-center px-0')}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.4)]">
          <TrendingUp className="h-4 w-4 text-white" strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <span className="text-[15px] font-semibold tracking-tight text-white">AuraTrade</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          // Use exact match for root-like paths, prefix+slash for nested ones
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/')

          const itemClass = cn(
            'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
            isActive
              ? 'bg-zinc-800 text-white'
              : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100',
            item.disabled && 'opacity-40',
            collapsed && 'justify-center px-0',
          )

          const inner = (
            <>
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && (
                <>
                  <span>{item.label}</span>
                  {item.hint && (
                    <span className="ml-auto opacity-0 transition-opacity group-hover:opacity-100">
                      <KbdHint hint={item.hint} />
                    </span>
                  )}
                  {item.disabled && (
                    <span className="ml-auto rounded bg-zinc-700/60 px-1.5 py-0.5 text-[10px] text-zinc-500">
                      soon
                    </span>
                  )}
                </>
              )}
            </>
          )

          if (item.disabled) {
            return (
              <span
                key={item.href}
                role="link"
                aria-disabled="true"
                aria-label={item.label}
                className={itemClass}
                title={collapsed ? item.label : undefined}
              >
                {inner}
              </span>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={itemClass}
              aria-label={collapsed ? item.label : undefined}
              title={collapsed ? item.label : undefined}
            >
              {inner}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className={cn('border-t border-zinc-800 p-3', collapsed && 'flex justify-center')}>
        {collapsed ? (
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            aria-label="Sign out"
            title="Sign out"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
          </button>
        ) : (
          <div className="space-y-2">
            <div className="rounded-lg bg-zinc-800/60 px-3 py-2">
              <p className="truncate text-[11px] font-medium text-zinc-100">{accountName}</p>
              <p className="truncate text-[10px] text-zinc-500">{userEmail}</p>
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-zinc-400 transition-colors hover:bg-zinc-800/70 hover:text-red-400"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        type="button"
        onClick={toggleCollapsed}
        className="absolute -right-3 top-[72px] flex h-6 w-6 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-zinc-400 shadow-md transition-colors hover:border-zinc-600 hover:text-zinc-100"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>
    </aside>
  )
}
