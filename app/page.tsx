import { Suspense } from 'react'
import { db } from '@/db'
import { tipsters } from '@/db/schema'
import { buildFilters, sortColumn, TipsterFilters, SortField } from '@/lib/query'
import { and, desc, count } from 'drizzle-orm'
import { FilterBar } from '@/components/FilterBar'
import { TipsterRow } from '@/components/TipsterRow'
import { LoadMore } from '@/components/LoadMore'

const PAGE_SIZE = 50

interface PageProps {
  searchParams: {
    tipo?: string; minYield?: string; minPicks?: string; activity?: string
    excludeYears?: string; priceMin?: string; priceMax?: string; sort?: string
  }
}

export default async function Home({ searchParams }: PageProps) {
  const filters: TipsterFilters = {
    tipo:           (searchParams.tipo as TipsterFilters['tipo']) ?? 'all',
    minYield:       searchParams.minYield ? Number(searchParams.minYield) : undefined,
    minPicks:       searchParams.minPicks ? Number(searchParams.minPicks) : undefined,
    activityMonths: searchParams.activity ? Number(searchParams.activity) : undefined,
    excludeYears:   searchParams.excludeYears
      ? searchParams.excludeYears.split(',').map(Number)
      : undefined,
    priceMin:       searchParams.priceMin ? Number(searchParams.priceMin) : undefined,
    priceMax:       searchParams.priceMax ? Number(searchParams.priceMax) : undefined,
  }

  const sort = (searchParams.sort as SortField) ?? 'yield'
  const where = buildFilters(filters)
  const whereClause = where.length ? and(...where) : undefined

  const [rows, [{ value: total }]] = await Promise.all([
    db.select().from(tipsters)
      .where(whereClause)
      .orderBy(desc(sortColumn(sort)))
      .limit(PAGE_SIZE),
    db.select({ value: count() }).from(tipsters).where(whereClause),
  ])

  const hasMore = rows.length === PAGE_SIZE
  const searchString = new URLSearchParams(searchParams as Record<string, string>).toString()

  return (
    <>
      <Suspense>
        <FilterBar />
      </Suspense>
      <div id="page-content" style={{ maxWidth: 1020, margin: '0 auto', padding: '0 12px' }}>
        <div style={{ padding: '8px 0 4px', fontSize: 13, color: '#777' }}>
          Mostrando <strong>{rows.length} de {total.toLocaleString('es')}</strong> tipsters
        </div>
        <div>
          {rows.map(t => <TipsterRow key={t.id} tipster={t} />)}
          <LoadMore initialHasMore={hasMore} searchString={searchString} />
        </div>
      </div>
    </>
  )
}
