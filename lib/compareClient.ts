'use client'
// Client-side compare selection, persisted in localStorage. No server writes.
import { COMPARE_MAX } from '@/lib/compare'

export const COMPARE_STORAGE_KEY = 'cf-compare-v1'
export const COMPARE_CHANGED_EVENT = 'cf-compare-changed'

export interface CompareItem {
  slug: string
  name: string
}

export function readCompareSelection(): CompareItem[] {
  try {
    const raw = window.localStorage.getItem(COMPARE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (it): it is CompareItem =>
        typeof it === 'object' && it !== null &&
        typeof it.slug === 'string' && typeof it.name === 'string'
    )
  } catch {
    return []
  }
}

function writeCompareSelection(items: CompareItem[]) {
  window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new Event(COMPARE_CHANGED_EVENT))
}

export function toggleCompareSlug(slug: string, name: string) {
  const sel = readCompareSelection()
  const idx = sel.findIndex(s => s.slug === slug)
  if (idx >= 0) {
    sel.splice(idx, 1)
  } else {
    if (sel.length >= COMPARE_MAX) return
    sel.push({ slug, name })
  }
  writeCompareSelection(sel)
}

export function removeCompareSlug(slug: string) {
  writeCompareSelection(readCompareSelection().filter(s => s.slug !== slug))
}

export function clearCompareSelection() {
  writeCompareSelection([])
}
