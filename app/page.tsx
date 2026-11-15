import { db } from '@/db'
import { tipsters } from '@/db/schema'
import { buildFilters, sortOrder, priceFilterIgnored, TipsterFilters, SortField } from '@/lib/query'
import { and, count } from 'drizzle-orm'
import { FilterBar } from '@/components/FilterBar'
import { LoadMore } from '@/components/LoadMore'

const PAGE_SIZE = 50

interface PageProps {
  searchParams: {
    search?: string; tipo?: string; minYield?: string; maxYield?: string; minPicks?: string
    activity?: string; minYears?: string; priceMin?: string; priceMax?: string; sort?: string
    conPicksFree?: string; resetOlderThan?: string; platform?: string
  }
}

export default async function Home({ searchParams }: PageProps) {
  const filters: TipsterFilters = {
    search:         searchParams.search ?? undefined,
    tipo:           (searchParams.tipo as TipsterFilters['tipo']) ?? 'all',
    minYield:       searchParams.minYield ? Number(searchParams.minYield) : undefined,
    maxYield:       searchParams.maxYield ? Number(searchParams.maxYield) : undefined,
    minPicks:       searchParams.minPicks ? Number(searchParams.minPicks) : undefined,
    activityMonths: searchParams.activity ? Number(searchParams.activity) : undefined,
    minYears:       searchParams.minYears ? Number(searchParams.minYears) : undefined,
    priceMin:       searchParams.priceMin ? Number(searchParams.priceMin) : undefined,
    priceMax:       searchParams.priceMax ? Number(searchParams.priceMax) : undefined,
    conPicksFree:   searchParams.conPicksFree === '1',
    resetOlderThan: searchParams.resetOlderThan === '1',
    platform:       searchParams.platform === 'all' ? undefined : ((searchParams.platform as TipsterFilters['platform']) ?? 'blogabet'),
  }

  const sort = (searchParams.sort as SortField) ?? 'yield'
  const where = buildFilters(filters)
  const whereClause = where.length ? and(...where) : undefined

  const [rows, [{ value: total }]] = await Promise.all([
    db.select().from(tipsters)
      .where(whereClause)
      .orderBy(...sortOrder(sort))
      .limit(PAGE_SIZE),
    db.select({ value: count() }).from(tipsters).where(whereClause),
  ])

  const hasMore = rows.length === PAGE_SIZE
  const searchString = new URLSearchParams(searchParams as Record<string, string>).toString()

  return (
    <>
      <FilterBar searchParams={searchParams} />
      <div id="page-content" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 12px' }}>
        {priceFilterIgnored(filters) && (
          <div style={{ margin: '8px 0 0', padding: '8px 12px', background: '#fff3cd', border: '1px solid #ffeeba', borderRadius: 4, fontSize: 13, color: '#856404' }}>
            {filters.platform === 'tipstrr'
              ? 'El filtro de precio no se aplica a Tipstrr: cobra en £ (GBP) y no es comparable con € sin conversión (no inventamos tipos de cambio). Los precios se muestran en su moneda.'
              : 'El filtro de precio no se aplica en la vista de todas las plataformas: Blogabet cobra en € y Tipstrr en £, y no son comparables sin conversión (no inventamos tipos de cambio). Los precios se muestran en su moneda.'}
          </div>
        )}
        <LoadMore key={searchString} initialRows={rows} initialHasMore={hasMore} total={total} searchString={searchString} />
      </div>
    </>
  )
}
