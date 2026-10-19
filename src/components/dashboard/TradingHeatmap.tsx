'use client'
import { useCurrencyFormat } from '@/components/providers/AmountPrivacy'

import { useState } from 'react'
import type { HeatmapMonth } from '@/lib/dashboard/types'


const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const selectClass = 'h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-xs text-zinc-200'

export default function TradingHeatmap({ months }: { months: HeatmapMonth[] }) {
  const [year, setYear] = useState('')
  const formatCurrency = useCurrencyFormat()
  const [monthNumber, setMonthNumber] = useState('')
  // Sort a copy: dashboard series and their financial calculations stay intact.
  const ordered = [...months].sort((a, b) => b.monthKey.localeCompare(a.monthKey))
  const years = [...new Set(ordered.map(month => month.monthKey.slice(0, 4)))]
  const visible = ordered.filter(month => (!year || month.monthKey.startsWith(`${year}-`))
    && (!monthNumber || month.monthKey.slice(5, 7) === monthNumber))

  if (!months.length) return <p className="text-sm text-zinc-500">No daily history yet.</p>

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3" role="group" aria-label="Heatmap filters">
        <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
          Year
          <select aria-label="Heatmap year" value={year} onChange={event => setYear(event.target.value)} className={selectClass}>
            <option value="">All years</option>
            {years.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
          Month
          <select aria-label="Heatmap month" value={monthNumber} onChange={event => setMonthNumber(event.target.value)} className={selectClass}>
            <option value="">All months</option>
            {monthNames.map((name, index) => <option key={name} value={String(index + 1).padStart(2, '0')}>{name}</option>)}
          </select>
        </label>
        {(year || monthNumber) && <button type="button" className="action-secondary h-9" onClick={() => { setYear(''); setMonthNumber('') }}>Clear calendar filters</button>}
      </div>
      <p className="mb-4 text-[11px] text-zinc-500">Newest month first · Filters apply only to this calendar within the dashboard date range.</p>
      <p role="status" className="mb-3 text-xs text-zinc-400">{visible.length} {visible.length === 1 ? 'month' : 'months'} shown</p>
      {!visible.length && <p className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-400">No trading history for this month and year. Choose another period or clear the calendar filters.</p>}
      <div className="space-y-4">
        {visible.map(month => (
          <section key={month.monthKey} aria-label={month.monthLabel} data-testid="heatmap-month" data-month={month.monthKey}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm text-zinc-300">{month.monthLabel}</h3>
              <p className={`font-mono text-xs ${month.totalPnl >= 0 ? 'text-profit' : 'text-loss'}`}>{formatCurrency(month.totalPnl)}</p>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {month.days.map(day => {
                const backgroundColor = day.pnl > 0 ? `color-mix(in srgb, var(--profit) ${8 + day.intensity * 20}%, var(--card))`
                  : day.pnl < 0 ? `color-mix(in srgb, var(--loss) ${8 + day.intensity * 20}%, var(--card))` : 'var(--muted)'
                return (
                  <div key={day.date} className="rounded-xl border border-zinc-800 p-2 text-center" data-pnl-tone={day.pnl > 0 ? 'profit' : day.pnl < 0 ? 'loss' : 'neutral'} style={{ backgroundColor }} title={`${day.date}: ${formatCurrency(day.pnl)} (${day.tradeCount} trades)`}>
                    <p className="font-mono text-xs text-zinc-200">{day.day}</p>
                    <p className="mt-1 text-[10px] text-foreground">{formatCurrency(day.pnl)}</p>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
