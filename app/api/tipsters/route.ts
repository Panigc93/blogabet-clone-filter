import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { tipsters } from '@/db/schema'
import { buildFilters, sortOrder, ignoredWarning, TipsterFilters, SortField } from '@/lib/query'
import { and } from 'drizzle-orm'

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams

  const filters: TipsterFilters = {
    // Default stays Blogabet-only: zero change for the current UI unless a
    // platform is explicitly chosen. platform=tipstrr opts in; platform=all
    // lists every platform (combined view).
    platform:       p.get('platform') === 'all' ? undefined : ((p.get('platform') as TipsterFilters['platform']) ?? 'blogabet'),
    search:         p.get('search') ?? undefined,
    tipo:           (p.get('tipo') as TipsterFilters['tipo']) ?? 'all',
    minYield:       p.has('minYield')  ? Number(p.get('minYield'))  : undefined,
    maxYield:       p.has('maxYield')  ? Number(p.get('maxYield'))  : undefined,
    minPicks:       p.has('minPicks')  ? Number(p.get('minPicks'))  : undefined,
    activityMonths: p.has('activity')  ? Number(p.get('activity'))  : undefined,
    minYears:       p.has('minYears') ? Number(p.get('minYears')) : undefined,
    priceMin:       p.has('priceMin')  ? Number(p.get('priceMin'))  : undefined,
    priceMax:       p.has('priceMax')  ? Number(p.get('priceMax'))  : undefined,
    conPicksFree:   p.get('conPicksFree') === '1',
    resetOlderThan: p.get('resetOlderThan') === '1',
  }

  const sort = (p.get('sort') as SortField) ?? 'yield'
  const page = Number(p.get('page') ?? 0)

  const where = buildFilters(filters)

  const rows = await db
    .select()
    .from(tipsters)
    .where(where.length ? and(...where) : undefined)
    .orderBy(...sortOrder(sort))
    .limit(PAGE_SIZE)
    .offset(page * PAGE_SIZE)

  const warnings: string[] = []
  const ignored = ignoredWarning(filters)
  if (ignored) {
    warnings.push(ignored)
  }

  return NextResponse.json({ data: rows, page, hasMore: rows.length === PAGE_SIZE, ...(warnings.length ? { warnings } : {}) })
}
