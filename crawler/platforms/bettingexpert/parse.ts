import { load } from 'cheerio'

/** Pure, offline profile reader. Never imports, fetches or estimates periods. */
export interface BettingexpertProfileCapture {
  platform: 'bettingexpert'
  username: string
  profileUrl: string
  capturedAt: string
  scope: 'profile-overall'
  periodLabel: 'Overall stats'
  profitUnit: 'bettingexpert-points'
  yieldBasis: 'source-reported-unverified-denominator'
  picks: number
  profit: number
  yieldPct: number
  averageStake: number
  winRatePct: number
  averageOdds: number
  yield3m: null
  yield6m: null
  yield12m: null
  warnings: string[]
}
export type ProfileResult = { ok: true; capture: BettingexpertProfileCapture } | { ok: false; reason: string }

export function parseBettingexpertProfile(
  html: string,
  expected: { username: string; profileUrl: string; capturedAt: string },
): ProfileResult {
  const fail = (reason: string): ProfileResult => ({ ok: false, reason })
  let url: URL
  try { url = new URL(expected.profileUrl) } catch { return fail('invalid-profile-url') }
  if (url.protocol !== 'https:' || url.hostname !== 'www.bettingexpert.com' || url.search || url.hash || url.pathname !== `/user/profile/${encodeURIComponent(expected.username)}`) return fail('unexpected-profile-url')
  if (!expected.username.trim() || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(expected.capturedAt) || !Number.isFinite(Date.parse(expected.capturedAt))) return fail('invalid-capture-context')
  const $ = load(html)
  const canonical = $('link[rel="canonical"]')
  if (canonical.length !== 1 || canonical.attr('href') !== expected.profileUrl) return fail('profile-identity-mismatch')
  const main = $('main').first()
  if (!main.length) return fail('missing-main')
  const heading = main.find('h1,h2,h3').filter((_, e) => $(e).text().trim() === 'Overall stats')
  if (heading.length !== 1) return fail('missing-or-duplicate-overall-heading')
  const overall = heading.parent()
  function field(label: string, overallOnly: boolean): number | null {
    const scope = overallOnly ? overall : main
    const labels = scope.find('div').filter((_, e) => $(e).children().length === 0 && $(e).text().trim().toLowerCase() === label.toLowerCase())
    if (labels.length !== 1) return null
    const raw = labels.prev().text().trim()
    if (!/^-?\d+(?:\.\d+)?%?$/.test(raw)) return null
    const value = Number(raw.replace('%', ''))
    return Number.isFinite(value) ? value : null
  }
  const picks = field('Tips', true), profit = field('Profit', false), yieldPct = field('Yield', false)
  const averageStake = field('Average stake', true), winRatePct = field('Win rate', true), averageOdds = field('Average odds', true)
  if ([picks, profit, yieldPct, averageStake, winRatePct, averageOdds].some(x => x === null)) return fail('missing-or-invalid-profile-stat')
  if (!Number.isSafeInteger(picks) || picks! < 0 || averageStake! < 0 || averageStake! > 10 || winRatePct! < 0 || winRatePct! > 100 || averageOdds! < 1) return fail('out-of-range-profile-stat')
  return { ok: true, capture: {
    platform: 'bettingexpert', ...expected, scope: 'profile-overall', periodLabel: 'Overall stats',
    profitUnit: 'bettingexpert-points', yieldBasis: 'source-reported-unverified-denominator',
    picks: picks!, profit: profit!, yieldPct: yieldPct!, averageStake: averageStake!, winRatePct: winRatePct!, averageOdds: averageOdds!,
    yield3m: null, yield6m: null, yield12m: null,
    warnings: ['Profile aggregate is not the ranking aggregate.', 'No historical coverage or period yields established.', 'Rounded average stake cannot establish the exact yield denominator.', 'Canonical username verified; source GUID must remain in the separate discovery manifest.'],
  } }
}
