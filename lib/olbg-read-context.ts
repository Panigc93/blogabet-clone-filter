import { sql, and, gte, lte, type SQL } from 'drizzle-orm'
import { tipsters } from '@/db/schema'
import { effectiveProfitUnit, buildFilters, type TipsterFilters, type SortField } from './query'
import { tipoCondition } from './access-classification'
import registrations from '@/data/olbg/pilot-registrations.json'
import { validOlbgRegistration } from '@/crawler/platforms/olbg/registration'
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
  // Small, source-dated registration facts for the approved pilot. No dates
  // are inferred from monthly coverage. Raw receipts are retained privately.
  const joinedDates = Object.fromEntries(registrations.filter(validOlbgRegistration).map(r=>[String(r.profileId),r.joinedAt]))
  // Correlated aggregate is in the SELECT projection only, not FROM/order/
  // filters/count. Only selected page rows read their exact retained snapshot;
  // the browser receives labels/counts/totals, never the monthly record.
  const observed = sql<unknown>`CASE WHEN ${tipsters.platform}='olbg' THEN
    (SELECT jsonb_build_object('covered',jsonb_agg(m->>'month' ORDER BY m->>'month'),
       'tips',sum((m->>'tips')::bigint),'lsp',sum((m->>'levelStakeProfit')::numeric))
     FROM olbg_monthly_snapshots observed_snapshot
     CROSS JOIN LATERAL jsonb_array_elements(observed_snapshot.record->'months') m
     WHERE observed_snapshot.profile_id=(olbg_stats.compact->>'profileId')::bigint
       AND observed_snapshot.captured_at=olbg_stats.captured_at
       AND observed_snapshot.record_sha256=olbg_stats.compact->>'snapshotHash') ELSE NULL END`
  const projection = {
    ...base.projection,
    olbgJoinedAt: sql<string|null>`CASE WHEN ${tipsters.platform}='olbg' THEN (${JSON.stringify(joinedDates)}::jsonb)->>${tipsters.slug} ELSE NULL END`,
    olbgObserved: enabled ? observed : sql<unknown>`NULL::jsonb`,
    picks: emptyAllTime<number>(tipsters.picks),
    profit: emptyAllTime<string>(tipsters.profit),
    profitUnit: sql<string>`CASE WHEN ${tipsters.platform} = 'olbg' THEN 'olbg-level-stakes-units' ELSE ${effectiveProfitUnit()} END`,
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
    picks6mAvg: sql<string | null>`CASE WHEN ${tipsters.platform} = 'olbg' THEN CASE WHEN (olbg_stats.compact->'windows'->1->>'present')::int=6 THEN (olbg_stats.compact->'windows'->1->>'tips')::numeric/6 ELSE NULL END ELSE ${base.projection.picks6mAvg} END`,
    olbgEvidence: sql<unknown>`CASE WHEN ${tipsters.platform} = 'olbg' THEN olbg_stats.compact - 'snapshotHash' ELSE NULL END`,
  }
  return {
    source, joinOn, projection,
    filters: (p: TipsterFilters): SQL[] => {
      const conditions = buildFilters({ ...p, tipo: 'all', minPicks: undefined, minYield: undefined, maxYield: undefined })
      if (p.tipo === 'free' || p.tipo === 'paid') conditions.push(tipoCondition(p.tipo, projection.isPaid))
      if (p.minPicks !== undefined) conditions.push(gte(projection.picks, p.minPicks))
      if (p.minYield !== undefined) conditions.push(gte(projection.yield, String(p.minYield)))
      if (p.maxYield !== undefined) conditions.push(lte(projection.yield, String(p.maxYield)))
      return conditions
    },
    order: (sort: SortField): SQL[] => {
      const column = sort === 'yield3m' ? projection.yield3m : sort === 'yield' ? projection.yield : sort === 'yield6m' ? projection.yield6m
        : sort === 'yield12m' ? projection.yield12m : sort === 'picks6m_avg' ? projection.picks6mAvg
        : sort === 'picks' ? projection.picks : sort === 'followers' ? projection.followers
        : sort === 'since_year' ? projection.sinceYear : sort === 'price' ? projection.price : null
      if (sort === 'profit') return [sql`${projection.profitUnit} ASC`, sql`${projection.profit} DESC NULLS LAST`, sql`${tipsters.id} DESC`]
      return column ? [sql`${column} DESC NULLS LAST`, sql`${tipsters.id} DESC`] : base.order(sort)
    },
    warnings: (p: TipsterFilters) => p.platform !== undefined && p.platform !== 'olbg' ? []
      : [
          'OLBG: las cifras principales son acumulados observados con su rango, no el histórico completo. Los filtros y el orden históricos no usan esos acumulados; los periodos 3/6/12m se mantienen separados.',
          ...(p.minPicks !== undefined || p.minYield !== undefined || p.maxYield !== undefined || p.tipo === 'free' || p.tipo === 'paid'
            ? ['OLBG: los filtros históricos y free/paid excluyen sus datos desconocidos; no equivalen a cero. El yield es calculado aproximado a stake fijo, separado del ROI publicado.'] : []),
        ],

  }
}
