import Image from 'next/image'
import { cn } from '@/lib/utils'

export default function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div role="img" aria-label="AuraTrade" className={cn('flex items-center gap-3', className)}>
      <Image src="/brand/aura-mark.svg" alt="" width={40} height={40} className="shrink-0" aria-hidden="true" />
      {!compact && <span aria-hidden="true" className="text-lg font-semibold tracking-[-0.04em] text-foreground">Aura<span className="font-normal text-zinc-400">Trade</span></span>}
    </div>
  )
}
