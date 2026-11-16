// Bet2Invest crawl PLANNER/RUNNER (preparatory, NOT wired to any workflow,
// cron or DB). Pure over injected fetch/sleep/clock: tests use fakes, and
// nothing here runs against the platform unless a caller injects a real
// fetch. Rules (from the 2026-11-16 public validation):
// - Anonymous plain GET is enough (SSR HTML); no login, no browser.
// - Pace >= 10.1 s between requests (injected sleep, never skipped).
// - STOP the whole run on 403/429, a challenge page, or a transport
//   failure (connection reset/timeout): a reset+timeout pair was observed
//   on one profile and its cause is unknown, so it is treated as a
//   throttling signal, not retried aggressively. A 'stopped' outcome is a
//   SITE-level signal: it says nothing about the profile that happened to
//   be requested, and profiles after it are never requested.
// - Enumeration comes from the sitemap: the default listing showed 50 rows,
//   all PRO, while the sitemap has 300 slugs (47 overlap). Why Free
//   profiles are absent from the listing is NOT established.
// - Each profile ends as exactly one outcome with a class; nothing is
//   persisted here: the caller receives mappings and decides.
import { parseProfilePage, isChallengeResponse, Bet2InvestParseError } from './parse'
import { bet2investProfileToInsert, type Bet2InvestDbMapping } from './to-db'
import { parseSitemapProfiles } from './catalog'

export const B2I_MIN_GAP_MS = 10_100

export interface FetchResult {
  status: number
  body: string
}
export type Fetcher = (url: string) => Promise<FetchResult> // throws on transport failure

export interface CrawlDeps {
  origin: string // REQUIRED, no default; production: https://bet2invest.com
  fetch: Fetcher
  sleep: (ms: number) => Promise<void>
  now: () => Date
}

// 'access-signal': 403/429/challenge/transport failure (possible throttling,
// NOT a confirmed block). 'service-error': HTTP 5xx (service-side failure).
export type StopCause = 'access-signal' | 'service-error'

export type CrawlOutcome =
  | { slug: string; kind: 'ok'; capturedAt: Date; mapping: Extract<Bet2InvestDbMapping, { ok: true }> }
  | { slug: string; kind: 'quarantine'; capturedAt: Date; reason: string }
  | { slug: string; kind: 'parse-failed'; capturedAt: Date; reason: string } // fail-closed: truncated/empty/changed layout
  | { slug: string; kind: 'stopped'; cause: StopCause; reason: string } // run halted here; profile NOT evaluated

export interface CrawlReport {
  outcomes: CrawlOutcome[]
  stoppedEarly: boolean
  requests: number
}

const profileUrl = (origin: string, slug: string) =>
  `${origin}/tipsters/performance-stats/${encodeURIComponent(slug)}`

export function planFromSitemap(xml: string, limit: number): string[] {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('limit must be a positive integer')
  return parseSitemapProfiles(xml).map((p) => p.slug).slice(0, limit)
}

// Mapping ids are assigned by the caller's transaction, never here.
export async function crawlProfiles(
  slugs: string[],
  deps: CrawlDeps,
  mapId: (slug: string) => number,
  onOutcome?: (outcome: CrawlOutcome) => void, // called right after each outcome (crash-safe persistence)
): Promise<CrawlReport> {
  const outcomes: CrawlOutcome[] = []
  let requests = 0
  let lastAt: number | null = null
  for (const slug of slugs) {
    if (lastAt !== null) {
      const wait = B2I_MIN_GAP_MS - (deps.now().getTime() - lastAt)
      if (wait > 0) await deps.sleep(wait)
    }
    lastAt = deps.now().getTime()
    requests++
    let res: FetchResult
    try {
      res = await deps.fetch(profileUrl(deps.origin, slug))
    } catch (e) {
      const o: CrawlOutcome = { slug, kind: 'stopped', cause: 'access-signal', reason: `transport failure (${(e as Error).message}): treated as throttling, run halted` }
      outcomes.push(o)
      onOutcome?.(o)
      return { outcomes, stoppedEarly: true, requests }
    }
    if (res.status === 403 || res.status === 429) {
      const o: CrawlOutcome = { slug, kind: 'stopped', cause: 'access-signal', reason: `HTTP ${res.status}: run halted` }
      outcomes.push(o)
      onOutcome?.(o)
      return { outcomes, stoppedEarly: true, requests }
    }
    if (res.status >= 500 && res.status <= 599) {
      // Service-side failure, not a profile parsing problem: halt the batch,
      // no automatic retry, last valid capture untouched. Not a confirmed block.
      const o: CrawlOutcome = { slug, kind: 'stopped', cause: 'service-error', reason: `HTTP ${res.status}: service failure, batch halted (not a confirmed block)` }
      outcomes.push(o)
      onOutcome?.(o)
      return { outcomes, stoppedEarly: true, requests }
    }
    const capturedAt = deps.now()
    if (res.status !== 200) {
      const o: CrawlOutcome = { slug, kind: 'parse-failed', capturedAt, reason: `HTTP ${res.status}: no stats evaluated` }
      outcomes.push(o)
      onOutcome?.(o)
      continue
    }
    if (isChallengeResponse(res.body)) {
      const o: CrawlOutcome = { slug, kind: 'stopped', cause: 'access-signal', reason: 'challenge page: no stats delivered: run halted' }
      outcomes.push(o)
      onOutcome?.(o)
      return { outcomes, stoppedEarly: true, requests }
    }
    try {
      const profile = parseProfilePage(res.body)
      if (profile.username.toLowerCase() !== slug.toLowerCase()) {
        const o: CrawlOutcome = { slug, kind: 'parse-failed', capturedAt, reason: `canonical slug ${profile.username} != requested ${slug}` }
        outcomes.push(o)
        onOutcome?.(o)
        continue
      }
      const mapping = bet2investProfileToInsert(profile, {
        id: mapId(slug),
        idSource: 'internal-transactional',
        slug,
        capturedAt,
      })
      const o: CrawlOutcome = mapping.ok
        ? { slug, kind: 'ok', capturedAt, mapping }
        : { slug, kind: 'quarantine', capturedAt, reason: mapping.reason }
      outcomes.push(o)
      onOutcome?.(o)
    } catch (e) {
      if (!(e instanceof Bet2InvestParseError)) throw e
      if (e.message.startsWith('challenge page')) {
        const o: CrawlOutcome = { slug, kind: 'stopped', cause: 'access-signal', reason: `${e.message}: run halted` }
        outcomes.push(o)
        onOutcome?.(o)
        return { outcomes, stoppedEarly: true, requests }
      }
      const o: CrawlOutcome = { slug, kind: 'parse-failed', capturedAt, reason: e.message }
      outcomes.push(o)
      onOutcome?.(o)
    }
  }
  return { outcomes, stoppedEarly: false, requests }
}
