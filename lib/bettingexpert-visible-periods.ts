// Browser-safe public period metadata. No receipts, private paths or captures.
export type BEVisibleQuality = 'contrasted' | 'experimental' | 'global-consistent' | 'reconstructed'
export type BEVisibleWindow = {
  value: string | null; picks: number | null; profit: string | null; stake: string | null
  quality: BEVisibleQuality; state: 'number' | 'held' | 'no_eligible_sample'
  reason: 'source_validation_pending' | 'no_eligible_sample' | null
  from: string; to: string
}
export type BEVisiblePeriods = {version: 1; slug: string; windows: Record<'3m'|'6m'|'12m', BEVisibleWindow>}
export function visibleBEPeriods(value: unknown, slug: string): value is BEVisiblePeriods {
  if (!value || typeof value !== 'object') return false
  const a = value as BEVisiblePeriods
  const decimal = (x: unknown) => typeof x === 'string' && /^-?\d+(?:\.\d+)?$/.test(x)
  return a.version === 1 && a.slug === slug && !!a.windows && (['3m','6m','12m'] as const).every(n => {
    const w=a.windows[n]
    if (!w || !['contrasted','experimental','global-consistent','reconstructed'].includes(w.quality)
      || !/^\d{4}-\d{2}$/.test(w.from) || !/^\d{4}-\d{2}$/.test(w.to)) return false
    if (w.state !== 'number') return ['held','no_eligible_sample'].includes(w.state)
      && [w.value,w.picks,w.profit,w.stake].every(v=>v===null) && w.reason !== null
    return w.reason === null && decimal(w.value) && decimal(w.profit) && decimal(w.stake)
      && Number(w.stake)>0 && Number.isSafeInteger(w.picks) && w.picks!>0
  })
}
