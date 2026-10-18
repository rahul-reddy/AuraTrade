import Link from 'next/link'
import { ArrowRight, FileUp, ChartNoAxesCombined, ScanLine } from 'lucide-react'

export default function EmptyAccountState({ missing = false, trades = false }: { missing?: boolean; trades?: boolean }) {
  return (
    <div className="workspace-page">
      <div className="empty-account mx-auto max-w-3xl py-12 sm:py-20">
        <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary"><ChartNoAxesCombined size={26} /></div>
        <p className="eyebrow mb-4">Your trading workspace</p>
        <h1 className="max-w-xl text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">Your next insight starts<br />with your first import.</h1>
        <p className="mt-5 text-sm text-zinc-400">{missing ? 'Trading account not found.' : 'No trading account found.'}</p>
        <p className="mt-2 max-w-lg text-sm leading-7 text-zinc-400">Bring your broker history into one clear view of your performance, positions, and trading patterns.</p>
        <Link href={missing && trades ? '/trades' : '/upload'} className="action-primary mt-7 inline-flex items-center gap-2">
          {missing && trades ? 'View your available accounts →' : 'Upload a CSV to get started →'}
        </Link>
        <div className="mt-12 grid gap-5 border-t border-zinc-800 pt-7 sm:grid-cols-3">
          {[
            { icon: FileUp, title: '01 / Import', text: 'Choose your Schwab or thinkorswim statement.' },
            { icon: ScanLine, title: '02 / Review', text: 'Check the preview before confirming your import.' },
            { icon: ArrowRight, title: '03 / Explore', text: 'Follow your performance down to each trade.' },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title}><Icon className="mb-4 h-4 w-4 text-zinc-400" /><p className="text-sm font-medium">{title}</p><p className="mt-2 text-xs leading-6 text-zinc-400">{text}</p></div>
          ))}
        </div>
      </div>
    </div>
  )
}
