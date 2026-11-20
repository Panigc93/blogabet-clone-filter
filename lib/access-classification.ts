import { sql, eq, type SQL } from 'drizzle-orm'
import { tipsters } from '@/db/schema'

// Free/Paid access classification ("verified access review").
//
// Opt-in via VERIFIED_ACCESS_REVIEW=1. With the flag unset every read keeps
// the legacy behavior exactly; nothing here is active by default.
//
// Product rule (Juan, 2026-11-20): unknown is FREE, not excluded — a row
// only leaves Free with affirmative paid evidence. NULL is kept for
// platforms whose stored flag contradicts an affirmative policy (OLBG/BE)
// or has no captured evidence (source-labelled platforms).
//
// Evidence basis (audit of 2026-11-19 over retained responses; see
// docs/verified-access-review.md):
// - Blogabet: two stored evidence layers, profile over listing.
//   Profile signal (migration 0007, parser crawler/blogabet-profile-signal.ts):
//   a subscribe box (with price, or SERVICE FULL without one) is affirmative
//   Paid. Everything else is Free by the product rule: the "free NON-VERIFIED
//   blog" banner, an observed profile with no paid signal, and unread rows
//   stored is_paid=false. Dead blogs ('blog-not-found') are Free by the same rule (no proof of
//   payment); their stale stored flags never resurrect.
// - OLBG / Bettingexpert: Free by affirmative source policy (their picks
//   are free on-platform; docs/olbg-scoped-free-release.md). A stored
//   is_paid=true there would contradict the policy and stays unclassified.
// - Tipstrr / Golazobets / Bet2Invest / Apuestes: the stored boolean is the
//   classification captured from each source. A NULL (no captured evidence)
//   stays unclassified on every branch: absence never asserts Free.
//
// Freshness of the stored row is a separate dimension and never part of
// this classification: no date threshold changes it.

export type AccessClass = 'free' | 'paid' | null

export function verifiedAccessReviewEnabled(env?: { VERIFIED_ACCESS_REVIEW?: string | undefined }): boolean {
  const value = env ? env.VERIFIED_ACCESS_REVIEW : process.env.VERIFIED_ACCESS_REVIEW
  return value === '1'
}

export function classifyAccess(row: {
  platform: string
  isPaid: boolean | null
  accessClass?: string | null
  accessEvidence?: string | null
  accessObservedAt?: Date | string | null
}): AccessClass {
  switch (row.platform) {
    case 'blogabet':
      // Regla de producto (Juan, 2026-11-20 18:30, WhatsApp, literal): sin
      // constancia de pago, la fila permanece en Free. Pago exige evidencia
      // afirmativa: señal de perfil (precio subscribe o SERVICE FULL) o, en
      // filas no leídas, el precio parseado del listing (is_paid=true).
      // Un perfil observado sin señal de pago es Free. Un blog muerto
      // ('blog-not-found') tampoco tiene constancia de pago: Free por la
      // misma regla; la evidencia interna lo marca y la limpieza de muertos
      // (decisión aparte) es lo que lo saca del catálogo. Sin excepciones.
      if (row.accessClass === 'paid') return 'paid'
      if (row.accessClass === 'free') return 'free'
      if (row.accessObservedAt) return 'free'
      return row.isPaid ? 'paid' : 'free'
    case 'olbg':
    case 'bettingexpert':
      return row.isPaid ? null : 'free'
    default:
      return row.isPaid === true ? 'paid' : row.isPaid === false ? 'free' : null
  }
}

// Same classification in SQL so Free/Paid filters, counts and pagination
// all agree before slicing. isPaidExpr lets the read layer pass its
// projected expression (OLBG nulls its own isPaid upstream; the platform
// branch still governs). A NULL class is excluded by both comparisons;
// the unfiltered listing ('all') keeps those rows.
export function effectiveAccessSql(isPaidExpr: SQL | typeof tipsters.isPaid = tipsters.isPaid): SQL<string | null> {
  // Column or projected SQL: both embed identically in a sql`` template.
  const expr = isPaidExpr as SQL
  return sql<string | null>`CASE
    WHEN ${tipsters.platform} = 'blogabet' THEN CASE
      WHEN ${tipsters.accessClass} = 'paid' THEN 'paid'
      WHEN ${tipsters.accessClass} = 'free' THEN 'free'
      WHEN ${tipsters.accessObservedAt} IS NOT NULL THEN 'free'
      WHEN ${expr} THEN 'paid'
      ELSE 'free' END
    WHEN ${tipsters.platform} IN ('olbg', 'bettingexpert') THEN CASE WHEN ${expr} THEN NULL ELSE 'free' END
    ELSE CASE WHEN ${expr} THEN 'paid' WHEN ${expr} IS NULL THEN NULL ELSE 'free' END
  END`
}

// Effective subscription price under the same rules (flag ON, Blogabet):
// an observed row uses the price seen on the profile (access_price), which
// is NULL on SERVICE FULL / free / no-signal / dead blogs — a stale listing
// price is never inherited. Unread rows and every other platform keep the
// stored price. Range filters (gte/lte) drop NULLs, so observed rows with
// no visible price simply do not match a price filter.
export function effectivePriceSql(): SQL<string | null> {
  return sql<string | null>`CASE
    WHEN ${tipsters.platform} = 'blogabet' AND ${tipsters.accessObservedAt} IS NOT NULL THEN ${tipsters.accessPrice}
    ELSE ${tipsters.price} END`
}

// Effective DISPLAY coherence (callers gate on verifiedAccessReviewEnabled):
// the existing paid indicator and price on the card follow the effective
// classification, not the raw listing boolean — SERVICE FULL stored
// is_paid=false shows the paid indicator (no price), a dead blog stored
// is_paid=true shows neither, and an unread row keeps the legacy values.
// No new badge, no UI change; only the two existing fields are mapped.
export function effectiveDisplayAccess<T extends {
  platform: string
  isPaid: boolean | null
  price: string | null
  accessClass?: string | null
  accessEvidence?: string | null
  accessObservedAt?: Date | string | null
  accessPrice?: string | null
}>(row: T): T {
  if (row.platform !== 'blogabet') return row
  const access = classifyAccess(row)
  return {
    ...row,
    isPaid: access === 'paid',
    price: access === 'paid' ? (row.accessObservedAt ? (row.accessPrice ?? null) : row.price) : null,
  }
}

// The tipo filter condition. Flag OFF: legacy boolean comparison,
// unchanged. Flag ON: effective comparison (Blogabet NULL no longer
// occurs; other platforms keep their policy/NULL branches).
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
