// Audit of request pacing from a log of ISO timestamps (any mix of SSR and API requests, one executor).
// Timestamps have 1 s resolution, so a measured gap of g seconds can really be g-1..g+1: a gap is only
// accepted when (g - 1) >= minSeconds, i.e. the audit is conservative.
export interface PacingViolation {
  index: number
  gapSeconds: number
}

export function auditPacing(isoTimestamps: string[], minSeconds: number, resolutionSeconds = 1): { ok: boolean; minGap: number | null; violations: PacingViolation[] } {
  const ts = isoTimestamps.map((t) => Date.parse(t))
  if (ts.some((t) => !Number.isFinite(t))) throw new Error('invalid timestamp')
  const violations: PacingViolation[] = []
  let minGap: number | null = null
  for (let i = 1; i < ts.length; i++) {
    const g = (ts[i] - ts[i - 1]) / 1000
    if (g < 0) throw new Error('timestamps not in order')
    if (minGap === null || g < minGap) minGap = g
    if (g - resolutionSeconds < minSeconds) violations.push({ index: i, gapSeconds: g })
  }
  return { ok: violations.length === 0, minGap, violations }
}
