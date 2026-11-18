import type { OlbgMonth, OlbgSource } from './reader'
import { summarizeOlbgMonths, type OlbgPreparedProfile } from './prepare'

// Public statistics only. No filesystem paths, auth, avatar ownership or account
// fields. Persist raw monthly source ROI, never an alleged aggregate source ROI.
export interface OlbgMonthlyRecord {
  version: 1
  profileId: number
  username: string
  profileUrl: string
  capturedAt: string
  sourceMonth: string
  scope: 'global-all-tips'
  source: OlbgSource
  months: OlbgMonth[]
}
const ym = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s)
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const nullable = (n: unknown) => n === null || finite(n)
const allowed = (o: object, keys: string[]) => Object.keys(o).every(k => keys.includes(k))
export function previousMonth(m: string) {
  const d = new Date(m + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1)
  return d.toISOString().slice(0, 7)
}
export function validOlbgMonth(m: OlbgMonth, sourceMonth: string): boolean {
  try {
      if (!allowed(m, ['month','currentMonth','tips','levelStakeProfit','competitionProfit','roiPct','strikePct'])) return false
      if (!ym(m.month) || m.month > sourceMonth || m.currentMonth !== (m.month === sourceMonth)) return false
      if (!Number.isSafeInteger(m.tips) || m.tips < 0 || m.tips > 1000000 || !finite(m.levelStakeProfit) || !finite(m.competitionProfit) || Math.abs(m.levelStakeProfit) > 1e9 || Math.abs(m.competitionProfit) > 1e12) return false
      if (Math.abs(m.levelStakeProfit * 100 - Math.round(m.levelStakeProfit * 100)) > 1e-6) return false
      if (m.tips === 0 && (m.levelStakeProfit !== 0 || m.roiPct !== null || m.strikePct !== null)) return false
      return nullable(m.roiPct) && nullable(m.strikePct) && (m.strikePct === null || m.strikePct >= 0 && m.strikePct <= 100)
  } catch { return false }
}
export function validMonthlyRecord(value: unknown): value is OlbgMonthlyRecord {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const r = value as OlbgMonthlyRecord
    if (!allowed(r, ['version','profileId','username','profileUrl','capturedAt','sourceMonth','scope','source','months'])) return false
    if (r.version !== 1 || !Number.isSafeInteger(r.profileId) || r.profileId <= 0 || r.scope !== 'global-all-tips') return false
    if (typeof r.username !== 'string' || !r.username.trim() || r.username.length > 300 || !ym(r.sourceMonth)) return false
    const at = new Date(r.capturedAt)
    if (!Number.isFinite(at.getTime()) || at.toISOString() !== r.capturedAt || r.sourceMonth !== r.capturedAt.slice(0, 7)) return false
    const profile = new URL(r.profileUrl)
    const src = new URL(r.source.url)
    if (profile.origin !== 'https://www.olbg.com' || profile.pathname !== `/tipsters/about/${r.profileId}` || profile.search || profile.hash || profile.username || profile.password) return false
    if (src.origin !== profile.origin || src.username || src.password || src.hash || src.search) return false
    const monthlyPath = `/tipsters/performance/month/${r.profileId}`
    if (![monthlyPath, monthlyPath + '/__data.json'].includes(src.pathname)) return false
    if (!allowed(r.source, ['url','capturedAt','httpDate','sha256','bytes']) || r.source.capturedAt !== r.capturedAt || !/^[a-f0-9]{64}$/.test(r.source.sha256) || !Number.isSafeInteger(r.source.bytes) || r.source.bytes < 1 || r.source.bytes > 2097152) return false
    if (!(r.source.httpDate === null || typeof r.source.httpDate === 'string')) return false
    if (!Array.isArray(r.months) || r.months.length > 13 || new Set(r.months.map(m => m.month)).size !== r.months.length) return false
    return r.months.every(m => validOlbgMonth(m, r.sourceMonth)) && JSON.stringify(r).length <= 131072
  } catch { return false }
}
export function monthlyRecord(p: OlbgPreparedProfile): OlbgMonthlyRecord {
  const source = p.sources[0]
  const sourceMonth = p.summaries[0].throughMonth
  const d = new Date(sourceMonth + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1)
  const r: OlbgMonthlyRecord = {
    version: 1, profileId: p.profileId, username: p.username, profileUrl: p.profileUrl,
    capturedAt: new Date(source.capturedAt).toISOString(), sourceMonth: d.toISOString().slice(0, 7),
    scope: 'global-all-tips', source: { url: source.url, capturedAt: new Date(source.capturedAt).toISOString(), httpDate: source.httpDate, sha256: source.sha256, bytes: source.bytes }, months: structuredClone(p.months),
  }
  if (!validMonthlyRecord(r)) throw new Error('Invalid OLBG monthly record')
  return r
}
export function recordSummaries(r: OlbgMonthlyRecord) {
  if (!validMonthlyRecord(r)) throw new Error('Invalid OLBG monthly record')
  return summarizeOlbgMonths(r.months, previousMonth(r.sourceMonth))
}
export function eligibleMonthlyRecord(r: unknown, now: Date): r is OlbgMonthlyRecord {
  return validMonthlyRecord(r) && Number.isFinite(now.getTime()) && r.capturedAt <= now.toISOString() && r.sourceMonth === now.toISOString().slice(0, 7)
}
