// Bet2Earn (bet2earn.com) source types. Capture route: anonymous public JSON
// API (no login, no cookies), 2026-11-20/21. Endpoints verified live:
//   list:    /api/user/premium|free?start=N&filters[...]&filters[sortBy]=followersCount
//            (offset pagination, 10 per page; a wrong parameter shape returns
//            {"status":"Forbidden"}, which is not a ban)
//   profile: /api/user/{nombre-minusculas}  (stats, avatar path, signup date)
//   history: /api/user/{nombre-minusculas}/fullExpired  (full settled history)
// Request pacing during capture: >=10 s between calls, zero blocks.
//
// Proven data semantics (docs/bet2earn-import-mapping.md):
// - profit/stake/odds per pick arrive UNROUNDED (up to ~18 decimal places),
//   so sum(profit)/sum(stake)*100 is exact; the only cross-check tolerance
//   needed is the published yield's own rounding: 2 decimals -> +-0.005,
//   integer -> +-0.5 (uniform rounding interval).
// - The site's monthly tables bucket picks by created_at (publication date),
//   NOT validation_date (settlement). Verified against 118 months of one
//   long history: a pick created 30-sep and settled 1-oct counts in Sep.
// - Profile tipsExpiredCount is the count of settled picks the profile
//   declares; a captured history is complete iff its length equals it.
// - Anonymous visibility: only 119 of 1738 free profiles expose their
//   expired history; the other 1619 return an empty list coherent with
//   their own tipsExpiredCount=0 despite count_tips>0. Cause not proven.
//   Empty histories are never imported as real zeros.

export interface Bet2earnPick {
  id: string
  created_at: string | null // 'YYYY-MM-DD HH:mm:ss', site timezone not exposed
  validation_date: string | null
  profit: number | null
  stake: number | null
  odds: number | null
  sport: string | null
}

export interface Bet2earnProfile {
  id: string // source UUID; does not fit tipsters.source_portfolio_id (integer)
  name: string // display case; lowercase form is the API path key
  avatar: string | null // path, e.g. '/storage/user/avatar/xx.jpg'; '/images/avatar-default.jpg' = no real photo
  created_at: string | null // signup, 'YYYY-MM-DD HH:mm:ss'
  count_tips: number | null // total picks incl. non-expired
  tipsExpiredCount: number | null // declared settled picks
  followers_count: number | null
  yield: number | null // published yield; integer OR 2 decimals
  profit: number | null // published units profit
}

// One JSONL row per tipster (data/bet2earn/profiles.jsonl, private, not
// committed). months aggregates the captured history by created_at
// 'YYYY-MM' (proven bucketing); a month absent from the map had no picks
// in the capture, not missing data. totals/months come only from the
// captured history; published* fields keep the profile's own figures.
export interface Bet2earnCaptureRow {
  slug: string // lowercase name used in the API path
  capturedAt: string // ISO instant of the capture
  sourceUrl: string // exact API URL fetched (verified destination)
  listSource: 'premium' | 'free' // listing the profile was enumerated from
  profile: Bet2earnProfile | null
  expiredPicks: number // captured history length
  months: Record<string, { picks: number; profit: number; stakes: number }>
  totals: { picks: number; profit: number; stakes: number } | null
  lastPickAt: string | null // max created_at across the captured history
  quarantine?: { reason: string } | null
}

export const BET2EARN_ORIGIN = 'https://bet2earn.com'

// The default avatar is not a real photo: never import it as one.
export function bet2earnAvatarUrl(avatar: string | null): string | null {
  if (!avatar) return null
  if (avatar === '/images/avatar-default.jpg') return null
  if (!avatar.startsWith('/')) return null // unexpected shape: never fabricate
  return `${BET2EARN_ORIGIN}${avatar}`
}

export function bet2earnSourceUrl(slug: string): string {
  return `${BET2EARN_ORIGIN}/api/user/${encodeURIComponent(slug)}`
}

// Public profile page, the destination a user should open. Demonstrated from
// the site's own links on 2026-11-21: the API slug (lowercase, spaces) becomes
// the frontend slug with spaces -> hyphens; underscores, '&' and accented
// letters are kept as-is (the site's own hrefs: "krlostm_winamax" ->
// /tipsters/krlostm_winamax, "mvpicks javi futbol femenino" ->
// /tipsters/mvpicks-javi-futbol-femenino, "elguije" (with u-umlaut) ->
// /tipsters/elg%C3%BCije, "pensador & grupo 6 pinnacle" ->
// /tipsters/pensador-&-grupo-6-pinnacle; clicking the last one rendered the
// matching profile). Link target only: the API source URL stays as provenance.
export function bet2earnProfileUrl(slug: string): string {
  return `${BET2EARN_ORIGIN}/tipsters/${slug.trim().toLowerCase().replace(/\s+/g, '-')}`
}

// Card destination derived from the captured API source URL. Anything that is
// not a captured /api/user/{slug} URL falls back to the site root: never
// fabricate a slug from a shape we have not seen.
export function bet2earnProfileUrlFromSource(sourceUrl: string | null): string {
  const fallback = `${BET2EARN_ORIGIN}/`
  if (!sourceUrl) return fallback
  const m = sourceUrl.match(/\/api\/user\/([^/]+)$/)
  if (!m) return fallback
  let slug: string
  try {
    slug = decodeURIComponent(m[1])
  } catch {
    return fallback
  }
  return bet2earnProfileUrl(slug)
}
