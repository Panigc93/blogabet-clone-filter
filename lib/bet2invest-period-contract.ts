// Pure shared contract: safe to use in server SQL planning and card mapping.
export const PERIODS = [3, 6, 12] as const
export type PeriodMonths = typeof PERIODS[number]
export interface WindowAudit {
  value: string | null; reason: string | null; bets: number; months: number
  caveats: string[]; from: string; to: string
}
export interface PeriodAudit {
  slug: string; capturedAt: string; windows: Record<PeriodMonths, WindowAudit>
}
export type AuditedTipster = { b2iAudit?: PeriodAudit | null }
export function windowBounds(capturedAt: Date, n: PeriodMonths): { from: string; to: string } {
  const end = new Date(Date.UTC(capturedAt.getUTCFullYear(), capturedAt.getUTCMonth(), 1))
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - n, 1))
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1))
  return { from: start.toISOString().slice(0, 7), to: last.toISOString().slice(0, 7) }
}
export function periodEligible(capturedAt: Date | string | null, audit: PeriodAudit | null | undefined, n: PeriodMonths, value: string | null, now: Date): boolean {
  if (!capturedAt || !audit || !validAudit(audit) || !value) return false
  const at = new Date(capturedAt)
  const w = audit.windows[n]
  const bounds = windowBounds(now, n)
  return Number.isFinite(at.getTime()) && at.getTime() <= now.getTime()
    && at.toISOString() === audit.capturedAt
    && at.toISOString().slice(0, 7) === now.toISOString().slice(0, 7)
    && w.from === bounds.from && w.to === bounds.to
    && w.value !== null && Number(w.value) === Number(value) && Number.isFinite(Number(value))
}
export function validAudit(value: unknown): value is PeriodAudit {
  if (!value || typeof value !== 'object') return false
  const a = value as PeriodAudit
  const at = new Date(a.capturedAt)
  if (!a.slug || typeof a.slug !== 'string' || !Number.isFinite(at.getTime()) || at.toISOString() !== a.capturedAt || !a.windows) return false
  return PERIODS.every((n) => {
    const w = a.windows[n]
    if (!w) return false
    const b = windowBounds(at, n)
    return w.from === b.from && w.to === b.to && Number.isSafeInteger(w.bets) && w.bets >= 0
      && Number.isSafeInteger(w.months) && w.months >= 0 && w.months <= n
      && (w.value === null || (typeof w.value === 'string' && w.value.trim() !== '' && Number.isFinite(Number(w.value)) && w.bets > 0 && w.months > 0 && w.reason === null))
      && (w.reason === null || typeof w.reason === 'string') && Array.isArray(w.caveats)
      && w.caveats.every((c) => typeof c === 'string')
  })
}
