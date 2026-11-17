import { activityCondition } from './activity-query'
import { eq, gt, gte, ilike, isNotNull, lte, or, SQL, sql } from 'drizzle-orm'
import { tipsters } from '@/db/schema'

export interface TipsterFilters {
  platform?: 'blogabet' | 'tipstrr' | 'golazobets' | 'bet2invest' | 'bettingexpert' // undefined = all platforms (callers: default to 'blogabet')
  search?: string
  tipo?: 'all' | 'free' | 'paid'
  minYield?: number
  maxYield?: number
  minPicks?: number
  activityMonths?: number  // 1 | 3 | 6 | 12
  activityUnknown?: boolean
  minYears?: number
  priceMin?: number
  priceMax?: number
  conPicksFree?: boolean
  resetOlderThan?: boolean
}

export type SortField = 'yield' | 'profit' | 'picks' | 'followers' | 'since_year' | 'price' | 'yield6m' | 'yield12m' | 'picks6m_avg'

export function buildFilters(params: TipsterFilters): SQL[] {
  const conditions: SQL[] = []

  if (params.search) {
    const term = `%${params.search}%`
    conditions.push(or(ilike(tipsters.name, term), ilike(tipsters.slug, term))!)
  }

  if (params.platform) {
    conditions.push(eq(tipsters.platform, params.platform))
  }

  if (params.tipo === 'free') {
    conditions.push(eq(tipsters.isPaid, false))
  } else if (params.tipo === 'paid') {
    conditions.push(eq(tipsters.isPaid, true))
  }

  if (params.minYield !== undefined) {
    conditions.push(gte(tipsters.yield, String(params.minYield)))
  }

  if (params.maxYield !== undefined) {
    conditions.push(lte(tipsters.yield, String(params.maxYield)))
  }

  if (params.minPicks !== undefined) {
    conditions.push(gte(tipsters.picks, params.minPicks))
  }

  // Activity evidence is independent of historical yield. BB keeps its proxy.
  if (params.activityUnknown || (Number.isSafeInteger(params.activityMonths) && params.activityMonths! > 0 && params.activityMonths! <= 1200)) {
    conditions.push(activityCondition(params.activityUnknown ? 1 : params.activityMonths!, params.activityUnknown))
  }

  if (params.resetOlderThan && params.platform === 'blogabet') {
    conditions.push(
      sql`(${tipsters.lastResetAt} IS NULL OR ${tipsters.lastResetAt} < NOW() - make_interval(months => 6))`
    )
  }

  if (params.minYears !== undefined && params.platform === 'blogabet') {
    conditions.push(lte(tipsters.sinceYear, new Date().getFullYear() - params.minYears))
  }

  if (params.conPicksFree && params.platform === 'blogabet') {
    conditions.push(isNotNull(tipsters.picksFree3mAvg))
    conditions.push(gt(tipsters.picksFree3mAvg, '0'))
  }

  // Prices are only comparable within one currency (BB EUR vs Tipstrr GBP;
  // no FX conversion is invented). The price filter is applied ONLY in the
  // Blogabet-only view: in the Tipstrr view or the combined all-platforms
  // view (platform undefined) applying it would silently hide every
  // non-EUR row as if no tipster existed — the caller signals the ignored
  // filter to the user instead (route warning + disabled UI).
  if ((params.priceMin !== undefined || params.priceMax !== undefined) && params.platform === 'blogabet') {
    conditions.push(eq(tipsters.isPaid, true))
    conditions.push(eq(tipsters.priceCurrency, 'eur'))
    if (params.priceMin !== undefined) {
      conditions.push(gte(tipsters.price, String(params.priceMin)))
    }
    if (params.priceMax !== undefined) {
      conditions.push(lte(tipsters.price, String(params.priceMax)))
    }
  }

  return conditions
}

// Blogabet-only filter keys: outside the Blogabet-only view they are
// ignored (never silently applied against null fields of other platforms)
// and must be signalled to the user.
export const BB_ONLY_FILTERS = ['minYears', 'conPicksFree', 'resetOlderThan', 'price'] as const
export type IgnoredFilter = typeof BB_ONLY_FILTERS[number]

// Filters the caller requested that this view does not apply.
export function ignoredFilters(params: TipsterFilters): IgnoredFilter[] {
  if (params.platform === 'blogabet') return []
  const out: IgnoredFilter[] = []
  if (params.minYears !== undefined) out.push('minYears')
  if (params.conPicksFree) out.push('conPicksFree')
  if (params.resetOlderThan) out.push('resetOlderThan')
  if (params.priceMin !== undefined || params.priceMax !== undefined) out.push('price')
  return out
}

// True when a price filter was requested but not applied because the
// view's currency is not comparable (Tipstrr GBP, or the combined
// all-platforms view mixing EUR and GBP — no FX invented).
export function priceFilterIgnored(params: TipsterFilters): boolean {
  return ignoredFilters(params).includes('price')
}

const IGNORED_LABELS: Record<IgnoredFilter, string> = {
  minYears: 'Años en BB',
  conPicksFree: 'Con picks free',
  resetOlderThan: 'Sin Reset +6 meses',
  price: 'Precio',
}

// User-facing wording (shared by page banner and API warnings) for the
// filters this view does not apply. Returns null when nothing is ignored.
export function ignoredWarning(params: TipsterFilters): string | null {
  const ignored = ignoredFilters(params)
  if (ignored.length === 0) return null
  const names = ignored.map(f => IGNORED_LABELS[f]).join(', ')
  const vista = params.platform === 'tipstrr' ? 'la vista Tipstrr'
    : params.platform === 'bet2invest' ? 'la vista Bet2Invest'
    : params.platform === 'bettingexpert' ? 'la vista Bettingexpert' : 'la vista de todas las plataformas'
  const fx = ignored.includes('price')
    ? ' Blogabet cobra en € y Tipstrr en £, no comparables sin conversión (no inventamos tipos de cambio): los precios se muestran en su moneda.'
    : ''
  return `No se aplican en ${vista} (son propios de Blogabet): ${names}.${fx}`
}

// Aviso visible cuando la vista combinada ('Todas') se ordena por beneficio:
// las unidades no comparten escala y la ordenacion las agrupa por profit_unit
// en orden alfabetico ASC (bet2invest-units, eur, golazobets-units, units),
// NO es un ranking global de beneficio.
export function profitSortWarning(sort: SortField, platform: TipsterFilters['platform']): string | null {
  if (sort !== 'profit' || platform !== undefined) return null
  return 'Orden por beneficio agrupado por unidad (u Bet2Invest, pt BE Bettingexpert, € Blogabet, u Golazobets, u Tipstrr): no son comparables entre si; no es un ranking global de beneficio.'
}

export function sortColumn(sort: SortField) {
  switch (sort) {
    case 'profit':      return tipsters.profit
    case 'picks':       return tipsters.picks
    case 'followers':   return tipsters.followers
    case 'since_year':  return tipsters.sinceYear
    case 'price':       return tipsters.price
    case 'yield6m':     return bettingexpertPeriodColumn(tipsters.yield6m)
    case 'yield12m':    return bettingexpertPeriodColumn(tipsters.yield12m)
    case 'picks6m_avg': return bettingexpertPeriodColumn(tipsters.picks6mAvg)
    default:            return tipsters.yield
  }
}

export function sortOrder(sort: SortField): SQL[] {
  if (sort === 'profit') {
    // El profit NO es comparable entre unidades ('eur' BB, 'units' Tipstrr,
    // 'golazobets-units', 'bet2invest-units'): una ordenación cruzada
    // silenciosa sería un ranking falso. Se agrupa por unidad y se ordena
    // por valor dentro de cada una.
    return [
      sql`${tipsters.profitUnit} ASC`,
      sql`${tipsters.profit} DESC NULLS LAST`,
      sql`${tipsters.id} DESC`,
    ]
  }
  return [
    sql`${sortColumn(sort)} DESC NULLS LAST`,
    sql`${tipsters.id} DESC`,
  ]
}

// Must be evaluated in SQL before ORDER/LIMIT/OFFSET, never only in cards.
export function bettingexpertPeriodColumn(column: typeof tipsters.yield6m | typeof tipsters.yield12m | typeof tipsters.picks6mAvg) {
  return sql<string | null>`CASE WHEN ${tipsters.platform} = 'bettingexpert' THEN NULL ELSE ${column} END`
}
export function bettingexpertApiProjection<T extends { platform: string }>(row: T): T {
  return row.platform === 'bettingexpert' ? { ...row, yield3m: null, yield6m: null, yield12m: null, picks6mAvg: null, picksFree3mAvg: null, yieldFree3m: null } : row
}
