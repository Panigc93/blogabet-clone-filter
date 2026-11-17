import { redirect } from 'next/navigation'
import { tipsterReadContext } from '@/lib/tipster-read-context'
import { loadDatabasePeriodAudits } from '@/lib/bet2invest-period-index'
import { parseActivity } from '@/lib/activity'
import { ActivityNotice } from '@/components/ActivityNotice'
import { db } from '@/db'
import { tipsters } from '@/db/schema'
import { ignoredWarning, profitSortWarning, TipsterFilters, SortField } from '@/lib/query'
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
  const activity = parseActivity(searchParams.activity)
  const filters: TipsterFilters = {
    search:         searchParams.search ?? undefined,
    tipo:           (searchParams.tipo as TipsterFilters['tipo']) ?? 'all',
    minYield:       searchParams.minYield ? Number(searchParams.minYield) : undefined,
    maxYield:       searchParams.maxYield ? Number(searchParams.maxYield) : undefined,
    minPicks:       searchParams.minPicks ? Number(searchParams.minPicks) : undefined,
    activityMonths: typeof activity === 'number' ? activity : undefined,
    activityUnknown: activity === 'unknown',
    minYears:       searchParams.minYears ? Number(searchParams.minYears) : undefined,
    priceMin:       searchParams.priceMin ? Number(searchParams.priceMin) : undefined,
    priceMax:       searchParams.priceMax ? Number(searchParams.priceMax) : undefined,
    conPicksFree:   searchParams.conPicksFree === '1',
    resetOlderThan: searchParams.resetOlderThan === '1',
    platform:       searchParams.platform === 'all' ? undefined : ((searchParams.platform as TipsterFilters['platform']) ?? 'blogabet'),
  }

  const sort = (searchParams.sort as SortField) ?? 'yield'
  const readAt = new Date()
  const periods = await tipsterReadContext(await loadDatabasePeriodAudits(readAt), readAt)
  const refreshUrl = '/?' + new URLSearchParams(searchParams as Record<string, string>).toString()
  if (periods.changedSinceAnchor) redirect(refreshUrl)
  const where = periods.filters(filters)
  const whereClause = where.length ? and(...where) : undefined

  const [rows, [{ value: total }]] = await Promise.all([
    db.select(periods.projection).from(tipsters).leftJoin(periods.base.source, periods.base.joinOn).leftJoin(periods.olbg.source, periods.olbg.joinOn)
      .where(whereClause)
      .orderBy(...periods.order(sort))
      .limit(PAGE_SIZE),
    db.select({ value: count() }).from(tipsters).leftJoin(periods.base.source, periods.base.joinOn).leftJoin(periods.olbg.source, periods.olbg.joinOn).where(whereClause),
  ])

  if (!await periods.revisionUnchanged()) redirect(refreshUrl)
  const filterWarning = [ignoredWarning(filters), ...periods.warnings(filters)].filter(Boolean).join(' ')
  const hasMore = rows.length === PAGE_SIZE
  const continuation = new URLSearchParams(searchParams as Record<string, string>)
  continuation.set('periodAnchor', readAt.toISOString())
  if (periods.revisionToken !== null) continuation.set('olbgRevision', periods.revisionToken)
  const searchString = continuation.toString()

  return (
    <>
      <FilterBar searchParams={searchParams} olbgEnabled={periods.enabled} />
      <div id="page-content" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 12px' }}>
        {profitSortWarning(sort, filters.platform) && (
          <div style={{ margin: '8px 0 0', padding: '8px 12px', background: '#fcf8e3', border: '1px solid #faebcc', borderRadius: 4, fontSize: 13, color: '#8a6d3b' }}>
            {profitSortWarning(sort, filters.platform)}
          </div>
        )}
        <ActivityNotice months={filters.activityMonths} unknown={filters.activityUnknown} />
        {filterWarning && (
          <div style={{ margin: '8px 0 0', padding: '8px 12px', background: '#fff3cd', border: '1px solid #ffeeba', borderRadius: 4, fontSize: 13, color: '#856404' }}>
            {filterWarning}
          </div>
        )}
        <LoadMore key={searchString} initialRows={rows} initialHasMore={hasMore} total={total} searchString={searchString} periodAnchor={readAt.toISOString()} />
      </div>
    </>
  )
}
