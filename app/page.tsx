import { db } from '@/db'
import { tipsters } from '@/db/schema'
import { buildFilters, sortOrder } from '@/lib/query'
import { parseListParams } from '@/lib/parseFilters'
import { and, count } from 'drizzle-orm'
import { FilterBar } from '@/components/FilterBar'
import { TipsterRow } from '@/components/TipsterRow'
import { LoadMore } from '@/components/LoadMore'
import { CompareTray } from '@/components/CompareTray'

const PAGE_SIZE = 50

interface PageProps {
  searchParams: Record<string, string | undefined>
}

export default async function Home({ searchParams }: PageProps) {
  const { filters, sort, dir } = parseListParams(searchParams)

  const where = buildFilters(filters)
  const whereClause = where.length ? and(...where) : undefined

  const [rows, [{ value: total }]] = await Promise.all([
    db.select().from(tipsters)
      .where(whereClause)
      .orderBy(...sortOrder(sort, dir))
      .limit(PAGE_SIZE),
    db.select({ value: count() }).from(tipsters).where(whereClause),
  ])

  const hasMore = rows.length === PAGE_SIZE
  const searchString = new URLSearchParams(searchParams as Record<string, string>).toString()

  return (
    <>
      <FilterBar searchParams={searchParams} />
      <div id="page-content" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 12px' }}>
        <div style={{ padding: '8px 0 4px', fontSize: 13, color: '#777', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Mostrando <strong>{rows.length} de {total}</strong> tipsters</span>
          <span style={{ fontStyle: 'italic', color: '#bbb', fontSize: 11 }}>stats mensuales calculados sobre meses cerrados</span>
        </div>
        <div>
          {rows.map(t => <TipsterRow key={t.id} tipster={t} />)}
          <LoadMore key={searchString} initialHasMore={hasMore} searchString={searchString} />
        </div>
      </div>
      <CompareTray />
    </>
  )
}
