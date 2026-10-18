'use client'

import { useSyncExternalStore } from 'react'
import { THEME_STORAGE_KEY, type Theme } from '@/lib/theme'

const CHANGE_EVENT = 'auratrade-theme-change'

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.classList.toggle('dark', theme === 'dark')
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
      applyTheme(event.newValue === 'light' ? 'light' : 'dark')
    }
  }
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

function getTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme, (): Theme => 'dark')
  function setTheme(value: Theme) {
    applyTheme(value)
    try { localStorage.setItem(THEME_STORAGE_KEY, value) } catch {
      // The switch still works for this document when storage is unavailable.
    }
  }
  return { theme, setTheme }
}
