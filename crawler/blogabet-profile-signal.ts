// Blogabet profile-page signal parser ("verified access review", sample of
// 2026-11-20, 13 profiles fetched with the authorized crawler method).
//
// The listing crawl (crawler/crawl.ts) can only assert Paid from a parsed €
// price: is_paid=false means "no price parsed", never Free. The profile home
// page (<slug>.blogabet.com/) carries affirmative signals the listing lacks:
//
//   - Non-verified blogs show an explicit banner: "This is a free
//     NON-VERIFIED blog!" — a positive FREE signal, not an absence.
//   - Paid services show a subscribe box with the price ("59€ / MONTH") —
//     a positive PAID signal that matches the stored listing price.
//   - A paid service with no open slots shows "SERVICE FULL" instead of a
//     price: still PAID, but the listing parses no price and stores
//     is_paid=false (observed live on ibet-35, which also carries paid-pick
//     history). This is the concrete proof that stored false ≠ free.
//   - Verified blogs without any subscribe box show nothing affirmative:
//     no banner, no price, only the generic FOLLOW button. Absence again —
//     they stay unclassified, never Free by default.
//   - Deleted blogs answer "Blog not found": every stored flag on such a
//     row is stale and must not feed any classification.
//
// Free-pick history (paidStatsTab / picks_free columns) is NOT a free
// service: ibet-35 shows free picks publicly while selling a full service.
//
// This module is pure parsing. Nothing here fetches anything: wiring a
// profile read into the crawl is a separate, unapproved change. Dates and
// evidence snippets travel with the signal so a future storage decision can
// keep provenance instead of a bare boolean.

export type BlogabetProfileSignal =
  | { kind: 'free-nonverified'; evidence: string }
  | { kind: 'paid-price'; priceEur: number; evidence: string }
  | { kind: 'paid-service-full'; evidence: string }
  | { kind: 'not-found' }
  | { kind: 'none' }

export type BlogabetProfileAccess = 'free' | 'paid' | null

export interface BlogabetProfileReading {
  signal: BlogabetProfileSignal
  // Access classification derived from the signal. 'not-found' and 'none'
  // both map to null (unclassified): a dead blog proves nothing about its
  // last living state, and a verified profile without a subscribe box
  // carries no affirmative free marker.
  access: BlogabetProfileAccess
  // True when the page is a live blog profile (any signal except not-found).
  live: boolean
}

const FREE_BANNER_RE = /This is a free NON-VERIFIED blog!/i
const NOT_FOUND_RE = /<title>Blog not found - Blogabet\.com/i
const SUBSCRIBE_PRICE_RE = /btn-subscribe[\s\S]{0,400}?tipster-price">\s*(\d+)&euro;\s*\/\s*<small class="duration-text">\s*MONTH/i
const SERVICE_FULL_RE = /btn-subscribe[\s\S]{0,300}?SERVICE FULL/i

export function parseBlogabetProfile(html: string): BlogabetProfileReading {
  if (NOT_FOUND_RE.test(html)) {
    return { signal: { kind: 'not-found' }, access: null, live: false }
  }
  const banner = html.match(FREE_BANNER_RE)
  if (banner) {
    return { signal: { kind: 'free-nonverified', evidence: banner[0] }, access: 'free', live: true }
  }
  const price = html.match(SUBSCRIBE_PRICE_RE)
  if (price) {
    return {
      signal: { kind: 'paid-price', priceEur: Number(price[1]), evidence: price[0].replace(/\s+/g, ' ').trim() },
      access: 'paid',
      live: true,
    }
  }
  const full = html.match(SERVICE_FULL_RE)
  if (full) {
    return {
      signal: { kind: 'paid-service-full', evidence: 'SERVICE FULL' },
      access: 'paid',
      live: true,
    }
  }
  return { signal: { kind: 'none' }, access: null, live: true }
}
