'use client'
import { useCallback, useSyncExternalStore } from 'react'

const memory = new Map<string, string>()
const changed = 'auratrade-browser-setting'
export function useBrowserSetting(key: string, fallback: string) {
  const read = useCallback(() => {
    if (memory.has(key)) return memory.get(key)!
    try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
  }, [key, fallback])
  const subscribe = useCallback((notify: () => void) => {
    const storage = (event: StorageEvent) => { if (event.key === key || event.key === null) { memory.delete(key); notify() } }
    const local = () => notify()
    window.addEventListener('storage', storage); window.addEventListener(changed, local)
    return () => { window.removeEventListener('storage', storage); window.removeEventListener(changed, local) }
  }, [key])
  const value = useSyncExternalStore(subscribe, read, () => fallback)
  const set = useCallback((next: string) => {
    memory.set(key, next)
    let persisted = true
    try { localStorage.setItem(key, next) } catch { persisted = false }
    window.dispatchEvent(new Event(changed))
    return persisted
  }, [key])
  return [value, set] as const
}
export function useChartSetting(name: string, fallback: boolean) {
  const [raw, set] = useBrowserSetting(`auratrade-chart-${name}`, String(fallback))
  return [raw === 'true', (value: boolean) => set(String(value))] as const
}
