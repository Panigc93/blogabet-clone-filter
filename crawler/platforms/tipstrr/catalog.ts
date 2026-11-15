// Catalog capture format for Tipstrr per-sport listings.
//
// Provenance discipline (2026-11-15): the listing endpoint returns a JSON
// array of slug STRINGS, 15 per page, with no total and no hasMore. Page
// size and boundary can only be stated as measured if every page's slug
// array is stored — page sizes without slugs are not verifiable (that
// mistake was made and corrected in docs/tipstrr-catalog.md).
//
// This module is offline-only: it validates and indexes a capture file
// produced by an explicitly authorized, bounded browser pass. It performs
// no network access and no DB writes. Catalog rows deliberately do NOT
// become tipsters-table inserts here: the listing exposes no portfolio id
// (our Tipstrr PK convention is -portfolioId, never invented) and its card
// metrics are the site's own period-window figures that cannot pass the
// per-record consistency gate — identity beyond slug/name and performance
// columns wait for the gated per-profile capture.

export const TIPSTRR_LISTING_PAGE_SIZE = 15 as const

// Exact parameter set observed in the site's own default football request
// (2026-11-15): every key is stored explicitly so a capture is
// reproducible and its filters auditable — no hidden defaults.
export interface CatalogQueryParams {
  filterType: number // observed 0
  sportId: number // football = 1
  profit: number // observed 0 (threshold)
  roi: number // observed 0 (threshold)
  tips: number // observed 45 (hidden minimum; whether 0 is accepted is an open validation)
  minOdds: number // observed 1.2
  maxOdds: number // observed 1000
  portfolioType: number // observed 2; semantics UNVERIFIED (portfolio.type: free=1, premium=2)
  order: number // observed 0; UI order options: Tipstrr rating / Profit / ROI
  period: number // observed 3; label mapping UNVERIFIED (options: month/3m/6m/12m/all)
}

export interface CatalogCardMetrics {
  slug: string
  displayName?: string
  // Card figures are the source's own computation over the selected
  // period window — never our verified yield. Kept as raw strings exactly
  // as displayed ("83.57%", "£2,047.40") so no parsing decision is hidden.
  roiDisplay?: string
  profitDisplay?: string
  winRateDisplay?: string
  avgOddsDisplay?: string
  avgTipsPerWeekDisplay?: string
  activeTips?: number // count badge on the card, no date attached
  sinceDisplay?: string // e.g. "March 2025" — month granularity
  sportScope?: 'football' | 'multi-sport' | string
}

export interface CatalogPage {
  page: number // 1-based, as requested
  fetchedAt: string // ISO instant of THIS page fetch
  slugs: string[] // raw array as returned
}

export interface CatalogCapture {
  meta: {
    source: 'tipstrr-listing'
    endpoint: string // e.g. https://tipstrr.com/api/portfolio
    params: CatalogQueryParams
    sport: string // human label, e.g. "football"
    executedAt: string // ISO instant of the pass
    note?: string
  }
  pages: CatalogPage[]
  cards?: CatalogCardMetrics[] // optional, from the rendered listing
}

export interface CatalogValidation {
  ok: boolean
  issues: string[]
  pageCount: number
  fetchedPages: number[] // sorted page numbers present
  missingPages: number[] // gaps inside 1..max(page)
  totalEntries: number // sum of page sizes (NOT unique tipsters)
  uniqueSlugs: number
  duplicateSlugs: string[]
  trailingEmptyPages: number
  nonTrailingEmptyPages: number[] // empty page followed by non-empty: ordering anomaly
  terminated: boolean // an empty page exists after the last non-empty one
}

export function validateCatalogCapture(c: CatalogCapture): CatalogValidation {
  const issues: string[] = []
  const pages = [...c.pages].sort((a, b) => a.page - b.page)
  if (pages.length === 0) issues.push('capture has no pages')

  const fetched = pages.map((p) => p.page)
  const dupPages = fetched.filter((p, i) => fetched.indexOf(p) !== i)
  if (dupPages.length > 0) issues.push(`duplicate page numbers: ${Array.from(new Set(dupPages)).join(',')}`)

  const maxPage = fetched.length ? Math.max(...fetched) : 0
  const missing: number[] = []
  for (let p = 1; p <= maxPage; p++) if (!fetched.includes(p)) missing.push(p)
  if (missing.length > 0)
    issues.push(`page(s) inside the range never fetched: ${missing.join(',')} — counts over it are assumed, not measured`)

  const seen = new Map<string, number[]>()
  for (const pg of pages) {
    for (const s of pg.slugs) {
      const arr = seen.get(s) ?? []
      arr.push(pg.page)
      seen.set(s, arr)
    }
  }
  const duplicateSlugs = Array.from(seen.entries()).filter(([, v]) => v.length > 1).map(([k]) => k)
  if (duplicateSlugs.length > 0)
    issues.push(`slug appears on multiple pages: ${duplicateSlugs.slice(0, 10).join(',')}`)

  const empty = pages.filter((p) => p.slugs.length === 0).map((p) => p.page)
  const lastNonEmpty = pages.filter((p) => p.slugs.length > 0).map((p) => p.page)
  const boundary = lastNonEmpty.length ? Math.max(...lastNonEmpty) : 0
  const nonTrailingEmptyPages = empty.filter((p) => p < boundary)
  if (nonTrailingEmptyPages.length > 0)
    issues.push(`empty page(s) before later non-empty page: ${nonTrailingEmptyPages.join(',')}`)
  const trailingEmptyPages = empty.filter((p) => p > boundary).length

  const oversized = pages.filter((p) => p.slugs.length > TIPSTRR_LISTING_PAGE_SIZE)
  if (oversized.length > 0)
    issues.push(`page(s) larger than observed page size ${TIPSTRR_LISTING_PAGE_SIZE}: ${oversized.map((p) => p.page).join(',')}`)

  return {
    ok: issues.length === 0,
    issues,
    pageCount: pages.length,
    fetchedPages: fetched,
    missingPages: missing,
    totalEntries: pages.reduce((acc, p) => acc + p.slugs.length, 0),
    uniqueSlugs: seen.size,
    duplicateSlugs,
    trailingEmptyPages,
    nonTrailingEmptyPages,
    terminated: trailingEmptyPages > 0,
  }
}

// The catalog answers "which slugs the listing exposes under THESE params"
// — nothing more. Activity (last pick date) and historical yield are
// profile-level data, deliberately absent here.
export interface CatalogIndex {
  params: CatalogQueryParams
  sport: string
  executedAt: string
  uniqueSlugs: string[]
  validation: CatalogValidation
}

export function buildCatalogIndex(c: CatalogCapture): CatalogIndex {
  const validation = validateCatalogCapture(c)
  const pages = [...c.pages].sort((a, b) => a.page - b.page)
  const out: string[] = []
  const seen = new Set<string>()
  for (const pg of pages)
    for (const s of pg.slugs)
      if (!seen.has(s)) {
        seen.add(s)
        out.push(s)
      }
  return {
    params: c.meta.params,
    sport: c.meta.sport,
    executedAt: c.meta.executedAt,
    uniqueSlugs: out,
    validation,
  }
}

// --- Selección definida por el usuario (2026-11-15 15:57 CET) -----------
// Orden ROI (periodo 3 meses), free y premium por separado, hasta 3
// páginas de cada tipo por deporte, y después stats por perfil.
// Pendiente de aclaración: su condición "siempre y cuando haya más de 12
// páginas" — propuesta enviada: si hay menos, coger las que haya (máx 3).
// Este planificador NO ejecuta nada: materializa el alcance para que el
// coste (peticiones, minutos) sea explícito antes de pedir autorización.

export const SELECTION_TYPES = [
  // Correspondencia indicada por el usuario: 1 = free, 2 = premium.
  // Coincide con el campo type de los perfiles capturados (StatMind free
  // type=1, TLE premium type=2), pero el valor del FILTRO se verifica en
  // la propia UI al ejecutar (seleccionar el filtro y leer la URL que
  // genera la página) — no se reinterpreta.
  { label: 'free', portfolioType: 1 },
  { label: 'premium', portfolioType: 2 },
] as const

export interface SelectionPlanOptions {
  pagesPerTypeMax: number // usuario: 3
  sports: { sportId: number; sport: string }[] // sportId conocido: football=1; el resto se resuelve en ejecución vía UI
}

export interface PlannedListingRequest {
  sport: string
  sportId: number
  typeLabel: 'free' | 'premium'
  portfolioType: number
  page: number // 1..pagesPerTypeMax
  // Condiciones de parada de la rama (deporte+tipo): página vacía o
  // parcial según lo aclarado; cualquier aviso/limitación detiene TODO.
}

export function planSelectionPass(opts: SelectionPlanOptions): PlannedListingRequest[] {
  const out: PlannedListingRequest[] = []
  for (const s of opts.sports)
    for (const t of SELECTION_TYPES)
      for (let p = 1; p <= opts.pagesPerTypeMax; p++)
        out.push({
          sport: s.sport,
          sportId: s.sportId,
          typeLabel: t.label,
          portfolioType: t.portfolioType,
          page: p,
        })
  return out
}

export interface SelectionBudget {
  sports: number
  maxListingRequests: number // sports × 2 tipos × pagesPerTypeMax
  minSecondsBetween: number // 15 según lo ya transmitido al usuario
  worstCaseMinutes: number // solo peticiones de listado, sin cargas de página
}

export function selectionBudget(sports: number, pagesPerTypeMax: number, minSecondsBetween = 15): SelectionBudget {
  const maxListingRequests = sports * SELECTION_TYPES.length * pagesPerTypeMax
  return {
    sports,
    maxListingRequests,
    minSecondsBetween,
    worstCaseMinutes: Math.ceil((maxListingRequests * minSecondsBetween) / 60),
  }
}
