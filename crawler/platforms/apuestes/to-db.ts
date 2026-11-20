// Maps one captured Apuestes profile row (data/apuestes/profiles.jsonl shape)
// to a tipsters-table insert record. Pure: performs no DB write. Applying it
// is gated (real import route + owner approval); the isolated PGlite seed is
// the only caller today.
//
// Unit discipline (validated against the capture, see docs/apuestes-import-mapping.md):
// - profit/stake are Apuestes UNITS with profitUnit='apuestes-units' (never
//   converted to money; the on-site EUR figure is the subscription price).
// - price stays NULL: the site exposes pricePlans keyed '10'/'12' whose
//   period semantics could not be verified from the capture alone, and
//   pickPrice is a per-pick price, not the subscription price. Importing a
//   guessed price would fabricate a figure.
// - yield columns are unitless percentages taken from the site blocks; a
//   window with 0 picks imports yield NULL (the schema columns are nullable;
//   a 0 would fabricate activity).
// - picks (tipsters.picks) is integer NOT NULL: rows whose totalPicks is in
//   conflict (listing vs profile) or missing are HELD OUT row-level by this
//   mapping (ok:false), never inserted with a fabricated 0.
// - Fields Apuestes does not expose stay null (verifiedPct, avatar, country,
//   signupAt); lastPickAt stays null: lastActivityMonth is month granularity,
//   not a pick date. resetCount 0 = "none exposed".

import type { TipsterInsert } from '@/db/schema'

export interface ApuestesPeriod {
  totalPicks: number | null
  yield: number | null
  totalProfit: number | null
  winRate: number | string | null
  stakeAvg: number | null
  oddsAvg: number | null
  winPicks: number | string | null
  lostPicks: number | string | null
  nullPicks: number | string | null
}

export interface ApuestesMonth {
  numpicks: number
  sumprofit: number
  sumstaked: number
  fecha_pub2: string // YYYY-MM
}

export interface ApuestesCaptureRow {
  id: number
  username: string
  capturedAt: string
  followers: number | null
  pickPrice: number | null
  plans: Record<string, number | null>
  isPaid?: boolean
  hist?: ApuestesPeriod
  m3?: ApuestesPeriod
  m6?: ApuestesPeriod
  m12?: ApuestesPeriod
  lastActivityMonth?: string | null
  months?: ApuestesMonth[]
  quarantine?: { http: string; reason: string } | null
  discrepancy?: { field: string; listingValue: number; profileValue: number } | null
  retry?: { outcome: string } | null
}

// Same provenance contract as tipstrr (crawler/platforms/tipstrr/to-db.ts):
// the real import route declares 'source-captured' or 'internal-transactional';
// the isolated seed declares 'isolated-fixture' and its ids are never payload.
export type ApuestesIdSource = 'source-captured' | 'internal-transactional' | 'isolated-fixture'

export interface ApuestesDbMappingOptions {
  id: number
  idSource: ApuestesIdSource
  slug: string // resolved collision-free within platform by the caller
  sourceUrl?: string | null // exact profile URL from the listing evidence (data/apuestes/profile-urls.json)
}

export type ApuestesDbMapping =
  | { ok: true; insert: TipsterInsert }
  | { ok: false; klass: string; reason: string }

// --- privacy -------------------------------------------------------------
// Some Apuestes usernames are personal email addresses. They must never be
// exposed in the product: display name is masked (local part truncated, no
// domain) and the slug never contains the address. The raw username stays
// only in the private dataset.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/

export function isEmailLike(username: string): boolean {
  return EMAIL_RE.test(username)
}

export function apuestesDisplayName(username: string): string {
  if (!isEmailLike(username)) return username
  const local = username.split('@')[0]
  return `${local.slice(0, 3)}***`
}

// URL-safe slug base: never contains '@' or dots from an address. Lowercase,
// runs of anything outside [a-z0-9-] collapse to one dash.
export function apuestesSlugBase(username: string): string {
  const base = username
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
  return base
}

// Collision-free slug within the apuestes platform. `[ XOVA ]` (id 14810)
// and `| XOVA |` (id 13394) both sanitize to 'xova': the second one gets
// the numeric-id suffix. Email-shaped usernames derive the base from the
// MASKED display name, so the address (local part + domain) never reaches
// the slug. Deterministic for a given dataset order; callers pass a shared
// `taken` set.
export function resolveApuestesSlug(username: string, id: number, taken: Set<string>): string {
  const raw = isEmailLike(username) ? apuestesDisplayName(username) : username
  const base = apuestesSlugBase(raw) || `tipster-${id}`
  const slug = taken.has(base) ? `${base}-${id}` : base
  taken.add(slug)
  return slug
}

export function apuestesSourceUrl(username: string): string {
  return `https://apuestes.com/tipster/${encodeURIComponent(username)}`
}

// months-incomplete detection (whole dataset checked 2026-11-20: exactly
// ids 54750 and 54299): the site exposes only recent months, so the months
// array cannot back the historical record.
export function isMonthsIncomplete(row: ApuestesCaptureRow): boolean {
  const total = row.hist?.totalPicks
  if (typeof total !== 'number' || total <= 0) return false
  const sum = (row.months ?? []).reduce((s, m) => s + (m.numpicks ?? 0), 0)
  return sum < total
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const windowYield = (w: ApuestesPeriod | undefined): string | null => {
  const picks = num(w?.totalPicks)
  const y = num(w?.yield)
  return picks !== null && picks > 0 && y !== null ? y.toFixed(2) : null
}

export function apuestesRowToInsert(row: ApuestesCaptureRow, opts: ApuestesDbMappingOptions): ApuestesDbMapping {
  if (row.quarantine) {
    return {
      ok: false,
      klass: 'cuarentena[capture]',
      reason: `quarantined at capture: ${row.quarantine.reason}${row.retry ? `; retry 2026-11-20: ${row.retry.outcome}` : ''}`,
    }
  }
  if (row.discrepancy) {
    return {
      ok: false,
      klass: 'cuarentena[totalPicks-discrepancy]',
      reason: `listing totalPicks=${row.discrepancy.listingValue} vs profile hist=${row.discrepancy.profileValue}; neither side validated; picks is NOT NULL so no field-level null is representable`,
    }
  }
  const total = num(row.hist?.totalPicks)
  if (total === null || total <= 0 || !row.months?.length) {
    return { ok: false, klass: 'cuarentena[no-usable-content]', reason: 'no hist.totalPicks or no months outside quarantine: capture inconsistency' }
  }
  if (isMonthsIncomplete(row)) {
    return {
      ok: false,
      klass: 'cuarentena[months-incomplete]',
      reason: 'sum(months.numpicks) below hist.totalPicks: site exposes only recent months; held pending adjudication',
    }
  }
  // Schema fit: yield columns are numeric(6,2) (max |9999.99|). A real
  // captured value outside that range (id 55379 NHLPICK, yield_3m -11100)
  // cannot be stored; clamping would fabricate and null would misreport an
  // active window as empty, so the row is HELD pending a column-widening
  // decision (migration = remote scope).
  for (const [label, w] of [['hist', row.hist], ['m3', row.m3], ['m6', row.m6], ['m12', row.m12]] as const) {
    const y = num(w?.yield)
    if (y !== null && Math.abs(y) >= 10000) {
      return {
        ok: false,
        klass: 'cuarentena[yield-out-of-schema-range]',
        reason: `${label} yield ${y} exceeds numeric(6,2); widening the column is a migration decision, not an import decision`,
      }
    }
  }

  const hist = row.hist!
  const paid = (row.pickPrice ?? 0) > 0 || Object.values(row.plans ?? {}).some(p => (p ?? 0) > 0)
  // Absence is not zero: a captured pickPrice/plan price of 0 is positive
  // free evidence, but a row with NO price fields at all carries no
  // classification evidence and is held out, never imported as free.
  const hasPriceEvidence = row.pickPrice != null || Object.values(row.plans ?? {}).some(p => p != null)
  if (!paid && !hasPriceEvidence) {
    return {
      ok: false,
      klass: 'cuarentena[price-evidence-absent]',
      reason: 'pickPrice and every plan price absent: no explicit zero; absence never classifies as free',
    }
  }
  const oldestMonth = row.months.reduce((min, m) => (m.fecha_pub2 < min ? m.fecha_pub2 : min), row.months[0].fecha_pub2)
  const captured = new Date(row.capturedAt)
  const m6picks = num(row.m6?.totalPicks)

  return { ok: true, insert: {
    id: opts.id,
    platform: 'apuestes',
    slug: opts.slug,
    name: apuestesDisplayName(row.username),
    avatarUrl: null,
    flagUrl: null,
    countryCode: null,
    isPaid: paid,
    price: null, // plan key semantics unverified; never a guessed figure
    profitUnit: 'apuestes-units',
    priceCurrency: 'eur',
    sinceYear: Number(oldestMonth.slice(0, 4)), // first month with recorded picks; not a signup date
    signupAt: null,
    capturedAt: captured,
    picks: total,
    profit: num(hist.totalProfit) !== null ? num(hist.totalProfit)!.toFixed(3) : null,
    yield: num(hist.yield) !== null ? num(hist.yield)!.toFixed(2) : null,
    verifiedPct: null, // not exposed by Apuestes
    isVerified: false, // schema notNull; source exposes no verification
    followers: row.followers ?? null,
    lastPickAt: null, // month granularity only; not a pick date
    resetCount: 0,
    lastResetAt: null,
    picks6mAvg: m6picks !== null && m6picks > 0 ? (m6picks / 6).toFixed(2) : null,
    yield3m: windowYield(row.m3),
    yield6m: windowYield(row.m6),
    yield12m: windowYield(row.m12),
    picksFree3mAvg: null, // free/paid split not exposed
    yieldFree3m: null,
    statsUpdatedAt: captured,
    sourcePortfolioId: row.id, // Apuestes numeric id: the natural key evidence
    // Exact URL from listing evidence — but for email-shaped usernames the
    // URL itself embeds the address, so it is NOT stored (the card links to
    // the listing instead). The address must not leak via href either.
    sourceUrl: isEmailLike(row.username) ? null : (opts.sourceUrl ?? null),
  } }
}

// Mirror of the tipstrr guard: rejects isolated-fixture ids before any real
// write. No real callers yet (tests only); the isolated seed does not call it.
export function assertApuestesImportProvenance(idSource: ApuestesIdSource, slug: string): void {
  if (idSource === 'isolated-fixture') {
    throw new Error(
      `import real rechazado para ${slug}: idSource '${idSource}' — los ids provisionales del entorno aislado no son payload importable`
    )
  }
}

// Mezcla upsert para la ruta de import. Contrato de ausencia vs vacío:
// el mapping NUNCA emite null por falta de dato (una captura sin el dato
// queda held, no llega aquí); un null en la fila nueva es siempre un VACÍO
// VERDADERO (p.ej. ventana con picks=0 explícito → yield NULL). Por tanto la
// mezcla SOBREESCRIBE todas las columnas gestionadas, incluidos los nulls:
// una ventana que pasa de poblada a vacía actualiza su yield a NULL en
// lugar de conservar el valor antiguo. Identidad inmutable (id/platform/slug).
// Pura: no toca la DB.
export function mergeApuestesUpdate(existing: TipsterInsert, next: TipsterInsert): TipsterInsert {
  return {
    ...next,
    id: existing.id,
    platform: existing.platform,
    slug: existing.slug,
  }
}
