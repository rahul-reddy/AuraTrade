import { TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="brand-mark flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
        <TrendingUp className="h-5 w-5 text-white" strokeWidth={2} aria-hidden="true" />
      </span>
      {!compact && <span className="text-lg font-semibold tracking-[-0.04em] text-white">Aura<span className="font-normal text-zinc-400">Trade</span></span>}
    </div>
  )
}
