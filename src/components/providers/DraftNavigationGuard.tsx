'use client'
import { useEffect } from 'react'

const drafts = new Set<symbol>()
export function useDraftNavigationGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const token = Symbol('unsaved-draft')
    drafts.add(token)
    return () => { drafts.delete(token) }
  }, [dirty])
}
export function confirmUnsavedNavigation() {
  return drafts.size === 0 || window.confirm('You have unsaved review changes. Discard them and continue?')
}
export function DraftLinkGuard() {
  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return
      const anchor = event.target.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download')) return
      const target = new URL(anchor.href, location.href)
      if (target.pathname === location.pathname && target.search === location.search) return
      if (!confirmUnsavedNavigation()) { event.preventDefault(); event.stopPropagation() }
    }
    document.addEventListener('click', click, true)
    return () => document.removeEventListener('click', click, true)
  }, [])
  return null
}
