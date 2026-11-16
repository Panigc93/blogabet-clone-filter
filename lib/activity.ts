// A recent publication is positive evidence, even if the history is partial.
// Missing/older evidence is NOT evidence of inactivity. BB keeps its proxy.
export interface ActivityEvidence {
  platform: 'golazobets' | 'tipstrr'
  slug: string
  sourceUrl: string
  capturedAt: string
  publishedLower: string // earliest possible UTC instant
  publishedUpper: string // latest possible UTC instant
  precision: 'utc' | 'timezone-unknown'
  coverage: 'sample' | 'first-page' | 'complete'
}

export function parseActivity(value: string | null | undefined): number | 'unknown' | undefined {
  if (value === 'unknown') return 'unknown'
  const n = Number(value)
  // Preserve existing direct URLs such as activity=2 (whole positive months).
  return value && Number.isSafeInteger(n) && n > 0 && n <= 1200 ? n : undefined
}

export function validEvidence(e: ActivityEvidence): boolean {
  if (!['golazobets', 'tipstrr'].includes(e.platform) || !e.slug || e.slug.includes('@')) return false
  const dates = [e.publishedLower, e.publishedUpper, e.capturedAt].map(Date.parse)
  return dates.every(Number.isFinite) && dates[0] <= dates[1] && dates[0] <= dates[2]
    && e.sourceUrl.startsWith(e.platform === 'golazobets'
      ? 'https://golazobets.com/tipster/' : 'https://tipstrr.com/tipster/')
}

// Golazobets exposes a naive wall-clock timestamp. Until its zone is verified,
// use the full civil UTC-offset range (-12..+14), not an invented local zone.
export function golazobetsPublicationBounds(raw: unknown): { lower: string; upper: string } | null {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) return null
  const iso = raw.replace(' ', 'T') + 'Z'
  const t = Date.parse(iso)
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 19) !== iso.slice(0, 19)) return null
  return { lower: new Date(t - 14 * 3600000).toISOString(), upper: new Date(t + 12 * 3600000).toISOString() }
}

// Matches PostgreSQL calendar-month subtraction at UTC month ends (clamped).
export function monthsBefore(now: Date, months: number): Date {
  const d = new Date(now)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - months)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return d
}

export function provesRecent(e: ActivityEvidence, cutoff: Date, now: Date): boolean {
  return validEvidence(e) && Date.parse(e.publishedLower) >= cutoff.getTime()
    && Date.parse(e.publishedUpper) <= now.getTime()
    && Date.parse(e.capturedAt) <= now.getTime()
}

// An observed publication cannot occur after the response capture. This is a
// causal bound, not a guessed timezone. Reject a lower bound after capture.
export function observedPublicationBounds(raw: unknown, capturedAt: string): { lower: string; upper: string } | null {
  const bounds = golazobetsPublicationBounds(raw)
  const capture = Date.parse(capturedAt)
  if (!bounds || !Number.isFinite(capture) || Date.parse(bounds.lower) > capture) return null
  return { lower: bounds.lower, upper: new Date(Math.min(Date.parse(bounds.upper), capture)).toISOString() }
}
