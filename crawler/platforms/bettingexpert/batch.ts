/** Public frontend query only. No network, DB, account or crawler side effects. */
export interface DiscoveryIdentity { guid: string; username: string }
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const MAX_PROFILE_BATCH = 6
export function buildProfileTotalsQuery(identities: DiscoveryIdentity[]) {
  if (!identities.length || identities.length > MAX_PROFILE_BATCH) throw new Error('batch-size-out-of-range')
  if (new Set(identities.map(x => x.guid)).size !== identities.length || identities.some(x => !GUID.test(x.guid) || !x.username.trim())) throw new Error('invalid-or-duplicate-identity')
  const declarations = identities.map((_, i) => `$f${i}:TipsFilter`).join(',')
  const fields = identities.map((_, i) => `p${i}:filterTips(language:"en",limit:1,skip:0,filters:$f${i}){count tips{user{guid username stats{profit yield tipsCount winRate rating}}}}`).join('')
  return {
    query: `query ProfileTotalsProbe(${declarations}){${fields}}`,
    variables: Object.fromEntries(identities.map((x, i) => [`f${i}`, { languages: [], allSports: true, active: false, showDeleted: false, user: x.guid }])),
  }
}
export type BatchRow = { guid: string; username: string; ok: false; reason: string } | {
  guid: string; username: string; ok: true; scope: 'profile-overall'; capturedAt: string;
  picks: number; profit: number; yieldPct: number; winRatePct: number | null;
  profitUnit: 'bettingexpert-points'; yield3m: null; yield6m: null; yield12m: null;
}
const object = (x: unknown): Record<string, unknown> | null => x !== null && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : null
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
export function parseProfileTotalsBatch(raw: unknown, identities: DiscoveryIdentity[], capturedAt: string): BatchRow[] {
  buildProfileTotalsQuery(identities) // validate bounds even for offline inputs
  if (!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(capturedAt) || !Number.isFinite(Date.parse(capturedAt))) throw new Error('invalid-capture-time')
  const root = object(raw), data = object(root?.data)
  return identities.map((identity, i): BatchRow => {
    const fail = (reason: string): BatchRow => ({ ...identity, ok: false, reason })
    if (!root || !data || (Array.isArray(root.errors) && root.errors.length > 0) || (root.errors != null && !Array.isArray(root.errors))) return fail('graphql-error-or-missing-data')
    const entry = object(data[`p${i}`]); const tips = entry?.tips
    if (!Array.isArray(tips) || tips.length !== 1) return fail('no-unique-author-sample')
    const user = object(object(tips[0])?.user)
    if (!user || user.guid !== identity.guid || user.username !== identity.username) return fail('author-identity-mismatch')
    const stats = object(user.stats)
    if (!stats || !finite(stats.tipsCount) || !Number.isSafeInteger(stats.tipsCount) || stats.tipsCount < 0 || !finite(stats.profit) || !finite(stats.yield)) return fail('missing-or-invalid-author-stats')
    if (stats.winRate != null && (!finite(stats.winRate) || stats.winRate < 0 || stats.winRate > 100)) return fail('invalid-win-rate')
    return { ...identity, ok: true, scope: 'profile-overall', capturedAt, picks: stats.tipsCount, profit: stats.profit, yieldPct: stats.yield,
      winRatePct: stats.winRate == null ? null : stats.winRate as number, profitUnit: 'bettingexpert-points', yield3m: null, yield6m: null, yield12m: null }
  })
}
