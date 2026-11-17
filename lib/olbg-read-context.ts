import { sql, and, eq, gte, lte, type SQL } from 'drizzle-orm'
import { tipsters } from '@/db/schema'
import { buildFilters, type TipsterFilters, type SortField } from './query'
import { periodReadContext } from './bet2invest-period-read'


// Compact active rows are joined inside SQL. No full-catalog JSON transfer.
export function olbgReadContext(base: ReturnType<typeof periodReadContext>, enabled: boolean, now = base.now) {
  const source = enabled ? sql`(SELECT a.profile_id::text slug,a.captured_at,a.compact FROM olbg_monthly_active a
    JOIN olbg_monthly_snapshots s ON s.profile_id=a.profile_id AND s.captured_at=a.captured_at
    WHERE a.compact_md5=md5(a.compact::text) AND a.compact->>'version'='1'
      AND a.compact->>'formula'='global-fixed-unit-v1'
      AND a.compact->>'snapshotHash'=s.record_sha256
      AND (a.compact->>'profileId')::bigint=a.profile_id
      AND (a.compact->>'capturedAt')::timestamptz=a.captured_at
      AND a.compact->>'sourceMonth'=${now.toISOString().slice(0,7)}
      AND a.captured_at<=${now.toISOString()}::timestamptz) AS olbg_stats`
    : sql`(SELECT NULL::text slug,NULL::timestamptz captured_at,NULL::jsonb compact WHERE false) AS olbg_stats`
  const joinOn = and(sql`${tipsters.platform} = 'olbg'`,sql`${tipsters.slug}=olbg_stats.slug`,sql`${tipsters.capturedAt}=olbg_stats.captured_at`)!
  const value = (n:number) => {
    const index = n===3?0:n===6?1:2
    return sql<string|null>`CASE WHEN (olbg_stats.compact->'windows'->(${index}::int)->>'present')::int=${n} AND (olbg_stats.compact->'windows'->(${index}::int)->>'tips')::numeric>0 THEN 100*(olbg_stats.compact->'windows'->(${index}::int)->>'lsp')::numeric/(olbg_stats.compact->'windows'->(${index}::int)->>'tips')::numeric ELSE NULL END`
  }
  const emptyAllTime = <T>(column: SQL<T> | object) => sql<T | null>`CASE WHEN ${tipsters.platform} = 'olbg' THEN NULL ELSE ${column} END`
  const period = (n: number, column: SQL<string | null>) => sql<string | null>`CASE WHEN ${tipsters.platform} = 'olbg' THEN ${value(n)} ELSE ${column} END`
  const projection = {
    ...base.projection,
    picks: emptyAllTime<number>(tipsters.picks),
    profit: emptyAllTime<string>(tipsters.profit),
    profitUnit: sql<string>`CASE WHEN ${tipsters.platform} = 'olbg' THEN 'olbg-level-stakes-units' ELSE ${tipsters.profitUnit} END`,
    yield: emptyAllTime<string>(tipsters.yield),
    followers: emptyAllTime<number>(tipsters.followers),
    sinceYear: emptyAllTime<number>(tipsters.sinceYear),
    verifiedPct: emptyAllTime<string>(tipsters.verifiedPct),
    isPaid: emptyAllTime<boolean>(tipsters.isPaid),
    isVerified: emptyAllTime<boolean>(tipsters.isVerified),
    price: emptyAllTime<string>(tipsters.price),
    priceCurrency: emptyAllTime<string>(tipsters.priceCurrency),
    lastPickAt: emptyAllTime<Date>(tipsters.lastPickAt),
    signupAt: emptyAllTime<Date>(tipsters.signupAt),
    resetCount: emptyAllTime<number>(tipsters.resetCount),
    lastResetAt: emptyAllTime<Date>(tipsters.lastResetAt),
    yield3m: period(3, base.projection.yield3m),
    yield6m: period(6, base.projection.yield6m),
    yield12m: period(12, base.projection.yield12m),
    picks6mAvg: sql<string | null>`CASE WHEN ${tipsters.platform} = 'olbg' THEN CASE WHEN (olbg_stats.compact->'windows'->1->>'present')::int=6 THEN (olbg_stats.compact->'windows'->1->>'tips')::numeric/6 ELSE NULL END ELSE ${tipsters.picks6mAvg} END`,
    olbgEvidence: sql<unknown>`CASE WHEN ${tipsters.platform} = 'olbg' THEN olbg_stats.compact - 'snapshotHash' ELSE NULL END`,
  }
  return {
    source, joinOn, projection,
    filters: (p: TipsterFilters): SQL[] => {
      const conditions = buildFilters({ ...p, tipo: 'all', minPicks: undefined, minYield: undefined, maxYield: undefined })
      if (p.tipo === 'free' || p.tipo === 'paid') conditions.push(eq(projection.isPaid, p.tipo === 'paid'))
      if (p.minPicks !== undefined) conditions.push(gte(projection.picks, p.minPicks))
      if (p.minYield !== undefined) conditions.push(gte(projection.yield, String(p.minYield)))
      if (p.maxYield !== undefined) conditions.push(lte(projection.yield, String(p.maxYield)))
      return conditions
    },
    order: (sort: SortField): SQL[] => {
      const column = sort === 'yield' ? projection.yield : sort === 'yield6m' ? projection.yield6m
        : sort === 'yield12m' ? projection.yield12m : sort === 'picks6m_avg' ? projection.picks6mAvg
        : sort === 'picks' ? projection.picks : sort === 'followers' ? projection.followers
        : sort === 'since_year' ? projection.sinceYear : sort === 'price' ? projection.price : null
      if (sort === 'profit') return [sql`${projection.profitUnit} ASC`, sql`${projection.profit} DESC NULLS LAST`, sql`${tipsters.id} DESC`]
      return column ? [sql`${column} DESC NULLS LAST`, sql`${tipsters.id} DESC`] : base.order(sort)
    },
    warnings: (p: TipsterFilters) => p.platform !== undefined && p.platform !== 'olbg' ? []
      : p.minPicks !== undefined || p.minYield !== undefined || p.maxYield !== undefined || p.tipo === 'free' || p.tipo === 'paid'
        ? ['OLBG: los filtros totales y free/paid excluyen sus datos desconocidos; no equivalen a cero. Los periodos son yield calculado aproximado a stake fijo, separado del ROI publicado.'] : [],

  }
}
