import Brand from '@/components/layout/Brand'
import ThemeToggle from '@/components/layout/ThemeToggle'
import { ArrowUpRight, ChartNoAxesCombined, Fingerprint, ScanLine } from 'lucide-react'

export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-shell relative grid min-h-dvh lg:grid-cols-2">
      <div className="absolute right-5 top-5 z-20"><ThemeToggle /></div>
      <section className="auth-story relative hidden overflow-hidden border-r border-zinc-800 p-12 lg:flex lg:flex-col xl:p-16">
        <Brand />
        <div className="relative z-10 my-auto max-w-lg py-16">
          <p className="eyebrow mb-6">Clarity behind every trade</p>
          <h2 className="text-5xl font-medium leading-[1.12] tracking-[-0.055em] xl:text-6xl">Understand your<br />performance.<br /><span className="text-primary">Refine your edge.</span></h2>
          <p className="mt-7 max-w-sm text-base leading-8 text-zinc-400">A focused workspace to turn your trading history into better informed decisions.</p>
          <div className="mt-10 space-y-5">
            {[{ icon: ChartNoAxesCombined, text: 'Explore performance beyond the P&L.' }, { icon: ScanLine, text: 'Trace every insight back to your trades.' }, { icon: Fingerprint, text: 'Keep your trading process in focus.' }].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-sm text-zinc-300"><Icon size={17} className="text-primary" />{text}</div>
            ))}
          </div>
        </div>
        <div className="relative z-10 flex items-center justify-between border-t border-border pt-6 text-xs text-zinc-400"><span>Built for the deliberate trader.</span><ArrowUpRight size={16} /></div>
      </section>
      <section className="flex flex-col items-center justify-center px-6 py-12 sm:px-12">
        <Brand className="mb-10 lg:hidden" />
        <div className="auth-form w-full max-w-[400px]">{children}</div>
        <p className="mt-8 text-center text-xs leading-6 text-zinc-500">Your history. Your process. Your edge.</p>
      </section>
    </main>
  )
}
