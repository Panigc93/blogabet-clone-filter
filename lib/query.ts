import { eq, gt, gte, ilike, isNotNull, lte, or, SQL, sql } from 'drizzle-orm'
import { tipsters } from '@/db/schema'

export interface TipsterFilters {
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
}

export type SortField = 'yield' | 'profit' | 'picks' | 'followers' | 'since_year' | 'price' | 'yield6m' | 'yield12m' | 'picks6m_avg'

export function buildFilters(params: TipsterFilters): SQL[] {
  const conditions: SQL[] = []

  if (params.search) {
    const term = `%${params.search}%`
    conditions.push(or(ilike(tipsters.name, term), ilike(tipsters.slug, term))!)
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

  if (params.minYears !== undefined) {
    conditions.push(lte(tipsters.sinceYear, new Date().getFullYear() - params.minYears))
  }

  if (params.conPicksFree) {
    conditions.push(isNotNull(tipsters.picksFree3mAvg))
    conditions.push(gt(tipsters.picksFree3mAvg, '0'))
  }

  if (params.priceMin !== undefined || params.priceMax !== undefined) {
    conditions.push(eq(tipsters.isPaid, true))
    if (params.priceMin !== undefined) {
      conditions.push(gte(tipsters.price, String(params.priceMin)))
    }
    if (params.priceMax !== undefined) {
      conditions.push(lte(tipsters.price, String(params.priceMax)))
    }
  }

  return conditions
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
