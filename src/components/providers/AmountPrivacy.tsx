'use client'
import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { useBrowserSetting } from './useBrowserSetting'

const Context = createContext({ hidden: false, toggle: () => {} })
export function AmountPrivacyProvider({ children }: { children: ReactNode }) {
  const [raw, set] = useBrowserSetting('auratrade-hide-amounts', 'false')
  const hidden = raw === 'true'
  useEffect(() => { document.documentElement.dataset.privateAmounts = hidden ? 'hidden' : 'visible' }, [hidden])
  return <Context.Provider value={{ hidden, toggle: () => set(String(!hidden)) }}>{children}</Context.Provider>
}
export function useHiddenAmounts() { return useContext(Context).hidden }
export function useCurrencyFormat(): typeof formatCurrency {
  const hidden = useHiddenAmounts()
  return useCallback((...args: Parameters<typeof formatCurrency>) => hidden ? '••••' : formatCurrency(...args), [hidden])
}
export function PrivateAmount({ children }: { children: ReactNode }) {
  const hidden = useHiddenAmounts()
  return <span data-private-amount="true">{hidden ? '••••' : children}</span>
}
export function AmountPrivacyToggle() {
  const { hidden, toggle } = useContext(Context)
  return <button type="button" aria-label={hidden ? 'Show P&L and balances' : 'Hide P&L and balances'} aria-pressed={hidden} title="Mask P&L, fees, and balances for screen sharing. Journals, prices, and screenshots remain visible." onClick={toggle} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground">{hidden ? <EyeOff size={16} /> : <Eye size={16} />}</button>
}
