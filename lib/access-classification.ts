import { sql, eq, type SQL } from 'drizzle-orm'
import { tipsters } from '@/db/schema'

// Tri-state Free/Paid access classification ("verified access review").
//
// Opt-in via VERIFIED_ACCESS_REVIEW=1. With the flag unset every read keeps
// the legacy behavior exactly; nothing here is active by default.
//
// Evidence basis (audit of 2026-11-19 over retained responses; see
// docs/verified-access-review.md):
// - Blogabet: the only stored positive signal is the subscription price /
//   special plan text parsed from the listing (crawler/crawl.ts).
//   is_paid=false is "no price parsed", NOT a free confirmation: rows with
//   is_paid=false exist whose stats show paid-pick history
//   (picks_free_3m_avg non-null; two verified live against #paidStatsTab).
//   The stats endpoint carries no free marker either (zero matches for the
//   "free NON-VERIFIED blog" banner in the retained bodies). So from stored
//   data Blogabet can assert Paid only; everything else is unclassified,
//   never Free.
// - OLBG / Bettingexpert: Free by affirmative source policy (their picks
//   are free on-platform; docs/olbg-scoped-free-release.md). A stored
//   is_paid=true there would contradict the policy and stays unclassified.
// - Tipstrr / Golazobets / Bet2Invest / Apuestes: the stored boolean is the
//   classification captured from each source.
//
// Freshness of the stored row is a separate dimension and never part of
// this classification: no date threshold turns an unclassified row free.

export type AccessClass = 'free' | 'paid' | null

export function verifiedAccessReviewEnabled(env?: { VERIFIED_ACCESS_REVIEW?: string | undefined }): boolean {
  const value = env ? env.VERIFIED_ACCESS_REVIEW : process.env.VERIFIED_ACCESS_REVIEW
  return value === '1'
}

export function classifyAccess(row: { platform: string; isPaid: boolean }): AccessClass {
  switch (row.platform) {
    case 'blogabet':
      return row.isPaid ? 'paid' : null
    case 'olbg':
    case 'bettingexpert':
      return row.isPaid ? null : 'free'
    default:
      return row.isPaid ? 'paid' : 'free'
  }
}

// Same classification in SQL so Free/Paid filters, counts and pagination
// all agree before slicing. isPaidExpr lets the read layer pass its
// projected expression (OLBG nulls its own isPaid upstream; the platform
// branch still governs). Unknown is NULL: comparing to 'free' or 'paid'
// excludes it, while the unfiltered listing ('all') keeps it.
export function effectiveAccessSql(isPaidExpr: SQL | typeof tipsters.isPaid = tipsters.isPaid): SQL<string | null> {
  // Column or projected SQL: both embed identically in a sql`` template.
  const expr = isPaidExpr as SQL
  return sql<string | null>`CASE
    WHEN ${tipsters.platform} = 'blogabet' THEN CASE WHEN ${expr} THEN 'paid' ELSE NULL END
    WHEN ${tipsters.platform} IN ('olbg', 'bettingexpert') THEN CASE WHEN ${expr} THEN NULL ELSE 'free' END
    ELSE CASE WHEN ${expr} THEN 'paid' ELSE 'free' END
  END`
}

// The tipo filter condition. Flag OFF: legacy boolean comparison,
// unchanged. Flag ON: tri-state comparison that keeps unclassified rows
// out of both Free and Paid (they stay in the unfiltered listing).
export function tipoCondition(
  tipo: 'free' | 'paid',
  isPaidExpr: SQL | typeof tipsters.isPaid = tipsters.isPaid,
  env?: { VERIFIED_ACCESS_REVIEW?: string | undefined },
): SQL {
  if (verifiedAccessReviewEnabled(env)) {
    return eq(effectiveAccessSql(isPaidExpr), tipo)
  }
  // Legacy path: a column or SQL left-hand side produces the same chunks.
  return eq(isPaidExpr as SQL, tipo === 'paid')
}
