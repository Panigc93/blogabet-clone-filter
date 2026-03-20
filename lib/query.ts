import { eq, gte, lte, notInArray, SQL, sql } from 'drizzle-orm'
import { tipsters } from '@/db/schema'

export interface TipsterFilters {
  tipo?: 'all' | 'free' | 'paid'
  minYield?: number
  minPicks?: number
  activityMonths?: number  // 1 | 3 | 6 | 12
  excludeYears?: number[]
  priceMin?: number
  priceMax?: number
}

export type SortField = 'yield' | 'profit' | 'picks' | 'followers' | 'since_year' | 'price'

export function buildFilters(params: TipsterFilters): SQL[] {
  const conditions: SQL[] = []

  if (params.tipo === 'free') {
    conditions.push(eq(tipsters.isPaid, false))
  } else if (params.tipo === 'paid') {
    conditions.push(eq(tipsters.isPaid, true))
  }

  if (params.minYield !== undefined) {
    conditions.push(gte(tipsters.yield, String(params.minYield)))
  }

  if (params.minPicks !== undefined) {
    conditions.push(gte(tipsters.picks, params.minPicks))
  }

  if (params.activityMonths !== undefined) {
    conditions.push(
      gte(tipsters.lastPickAt, sql`NOW() - make_interval(months => ${params.activityMonths})`)
    )
  }

  if (params.excludeYears && params.excludeYears.length > 0) {
    conditions.push(notInArray(tipsters.sinceYear, params.excludeYears))
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
    case 'profit':    return tipsters.profit
    case 'picks':     return tipsters.picks
    case 'followers': return tipsters.followers
    case 'since_year':return tipsters.sinceYear
    case 'price':     return tipsters.price
    default:          return tipsters.yield
  }
}
