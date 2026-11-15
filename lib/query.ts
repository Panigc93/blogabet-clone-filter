import { eq, gt, gte, ilike, isNotNull, lte, or, SQL, sql } from 'drizzle-orm'
import { tipsters } from '@/db/schema'

export interface TipsterFilters {
  platform?: 'blogabet' | 'tipstrr' // undefined = all platforms (callers: default to 'blogabet' until multi-source UI lands)
  search?: string
  tipo?: 'all' | 'free' | 'paid'
  minYield?: number
  maxYield?: number
  minPicks?: number
  activityMonths?: number  // 1 | 3 | 6 | 12
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

  if (params.activityMonths !== undefined) {
    conditions.push(
      gte(tipsters.lastPickAt, sql`NOW() - make_interval(months => ${params.activityMonths})`)
    )
  }

  if (params.resetOlderThan ) {
    conditions.push(
      sql`(${tipsters.lastResetAt} IS NULL OR ${tipsters.lastResetAt} < NOW() - make_interval(months => 6))`
    )
  }

  if (params.minYears !== undefined) {
    conditions.push(lte(tipsters.sinceYear, new Date().getFullYear() - params.minYears))
  }

  if (params.conPicksFree) {
    conditions.push(isNotNull(tipsters.picksFree3mAvg))
    conditions.push(gt(tipsters.picksFree3mAvg, '0'))
  }

  // Prices are only comparable within one currency (BB EUR vs Tipstrr GBP;
  // no FX conversion is invented). When the caller explicitly asks for a
  // non-EUR platform, the price filter is NOT applied — the caller signals
  // that to the user (route warning + disabled UI) instead of silently
  // returning zero rows as if no tipster existed.
  if ((params.priceMin !== undefined || params.priceMax !== undefined) && params.platform !== 'tipstrr') {
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

// True when a price filter was requested but not applied because the
// platform's currency is not comparable (GBP vs EUR, no FX).
export function priceFilterIgnored(params: TipsterFilters): boolean {
  return (
    (params.priceMin !== undefined || params.priceMax !== undefined) &&
    params.platform === 'tipstrr'
  )
}

export function sortColumn(sort: SortField) {
  switch (sort) {
    case 'profit':      return tipsters.profit
    case 'picks':       return tipsters.picks
    case 'followers':   return tipsters.followers
    case 'since_year':  return tipsters.sinceYear
    case 'price':       return tipsters.price
    case 'yield6m':     return tipsters.yield6m
    case 'yield12m':    return tipsters.yield12m
    case 'picks6m_avg': return tipsters.picks6mAvg
    default:            return tipsters.yield
  }
}

export function sortOrder(sort: SortField): SQL[] {
  return [
    sql`${sortColumn(sort)} DESC NULLS LAST`,
    sql`${tipsters.id} DESC`,
  ]
}
