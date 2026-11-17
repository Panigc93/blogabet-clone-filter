import { validOlbgMonth, previousMonth, type OlbgMonthlyRecord } from '@/crawler/platforms/olbg/monthly-record'
import { summarizeOlbgMonths } from '@/crawler/platforms/olbg/prepare'
import type { OlbgMonth } from '@/crawler/platforms/olbg/reader'

export type OlbgReadEvidence = Pick<OlbgMonthlyRecord, 'profileId' | 'username' | 'profileUrl' | 'capturedAt' | 'sourceMonth' | 'months'>
export function validOlbgReadEvidence(x: unknown): x is OlbgReadEvidence {
  if (!x || typeof x !== 'object') return false
  const e = x as OlbgReadEvidence
  try {
    const keys = ['profileId','username','profileUrl','capturedAt','sourceMonth','months']
    if (Object.keys(e).some(k => !keys.includes(k)) || !Number.isSafeInteger(e.profileId) || e.profileId <= 0 || typeof e.username !== 'string' || !e.username.trim() || e.username.length > 300) return false
    const at = new Date(e.capturedAt)
    if (!Number.isFinite(at.getTime()) || at.toISOString() !== e.capturedAt || e.sourceMonth !== e.capturedAt.slice(0,7)) return false
    if (e.profileUrl !== `https://www.olbg.com/tipsters/about/${e.profileId}`) return false
    return Array.isArray(e.months) && e.months.length <= 13 && new Set(e.months.map(m => m.month)).size === e.months.length && e.months.every(m => validOlbgMonth(m as OlbgMonth, e.sourceMonth))
  } catch { return false }
}
export function olbgEvidenceSummaries(e: OlbgReadEvidence) {
  if (!validOlbgReadEvidence(e)) throw new Error('Invalid public OLBG statistical evidence')
  return summarizeOlbgMonths(e.months, previousMonth(e.sourceMonth))
}
