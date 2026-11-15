// Decide whether the stats crawler may clear stats of "inactive" tipsters.
// "Inactive" is derived from last_pick_at, which only the catalog crawl refreshes.
// If the catalog crawl has been failing, most rows look stale and clearing would
// wipe valid stats. Clear only when the catalog looks fresh.

export interface CatalogFreshness {
  /** Tipsters whose last_pick_at is inside the activity window. */
  activeInWindow: number
  /** Of those, how many were refreshed by the catalog crawl recently. */
  refreshedRecently: number
}

export const MIN_REFRESHED_RATIO = 0.8

export function shouldClearInactiveStats(f: CatalogFreshness): { clear: boolean; reason: string } {
  if (f.activeInWindow < 0 || f.refreshedRecently < 0 || f.refreshedRecently > f.activeInWindow) {
    return { clear: false, reason: 'invalid counts' }
  }
  if (f.activeInWindow === 0) {
    return { clear: false, reason: 'no active tipsters in window: catalog looks empty or stale' }
  }
  const ratio = f.refreshedRecently / f.activeInWindow
  if (ratio < MIN_REFRESHED_RATIO) {
    return {
      clear: false,
      reason: `catalog stale: ${f.refreshedRecently}/${f.activeInWindow} active tipsters refreshed recently (< ${MIN_REFRESHED_RATIO})`,
    }
  }
  return { clear: true, reason: 'catalog fresh' }
}
