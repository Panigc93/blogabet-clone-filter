import { sql, and, eq, gte, lte, type SQL } from 'drizzle-orm'
import { tipsters } from '@/db/schema'
import { buildFilters, type TipsterFilters, type SortField } from './query'
import registrations from '@/data/olbg/pilot-registrations.json'
import { validOlbgRegistration } from '@/crawler/platforms/olbg/registration'
import { periodReadContext } from './bet2invest-period-read'


// Compact active rows are joined inside SQL. No full-catalog JSON transfer.
export function olbgReadContext(base: ReturnType<typeof periodReadContext>, enabled: boolean, now = base.now) {
  // The observed sample is computed once inside the olbg_stats subquery so the
  // card figures AND the historical filters/sort read the same partial values.
  // It stays display-scoped: never an all-time claim, only retained months.
  const observedSubquery = `(SELECT jsonb_build_object('covered',jsonb_agg(m->>'month' ORDER BY m->>'month'),'tips',sum((m->>'tips')::bigint),'lsp',sum((m->>'levelStakeProfit')::numeric)) FROM olbg_monthly_snapshots osnap CROSS JOIN LATERAL jsonb_array_elements(osnap.record->'months') m WHERE osnap.profile_id=a.profile_id AND osnap.captured_at=a.captured_at AND osnap.record_sha256=a.compact->>'snapshotHash')`
  const source = enabled ? sql`(SELECT a.profile_id::text slug,a.captured_at,a.compact,${sql.raw(observedSubquery)} AS observed FROM olbg_monthly_active a
    JOIN olbg_monthly_snapshots s ON s.profile_id=a.profile_id AND s.captured_at=a.captured_at
    WHERE a.compact_md5=md5(a.compact::text) AND a.compact->>'version'='1'
      AND a.compact->>'formula'='global-fixed-unit-v1'
      AND a.compact->>'snapshotHash'=s.record_sha256
      AND (a.compact->>'profileId')::bigint=a.profile_id
      AND (a.compact->>'capturedAt')::timestamptz=a.captured_at
      AND a.compact->>'sourceMonth'=${now.toISOString().slice(0,7)}
      AND a.captured_at<=${now.toISOString()}::timestamptz) AS olbg_stats`
    : sql`(SELECT NULL::text slug,NULL::timestamptz captured_at,NULL::jsonb compact,NULL::jsonb observed WHERE false) AS olbg_stats`
  const joinOn = and(sql`${tipsters.platform} = 'olbg'`,sql`${tipsters.slug}=olbg_stats.slug`,sql`${tipsters.capturedAt}=olbg_stats.captured_at`)!
  const value = (n:number) => {
    const index = n===3?0:n===6?1:2
    return sql<string|null>`CASE WHEN (olbg_stats.compact->'windows'->(${index}::int)->>'present')::int=${n} AND (olbg_stats.compact->'windows'->(${index}::int)->>'tips')::numeric>0 THEN 100*(olbg_stats.compact->'windows'->(${index}::int)->>'lsp')::numeric/(olbg_stats.compact->'windows'->(${index}::int)->>'tips')::numeric ELSE NULL END`
  }
  const emptyAllTime = <T>(column: SQL<T> | object) => sql<T | null>`CASE WHEN ${tipsters.platform} = 'olbg' THEN NULL ELSE ${column} END`
  // Visible main figures for OLBG: the observed partial sample, so filters and
  // sorting use exactly what the card shows. NULL when there is no current evidence.
  const observedOr = <T>(observed: SQL<T>, column: SQL<T> | object) => sql<T | null>`CASE WHEN ${tipsters.platform} = 'olbg' THEN ${observed} ELSE ${column} END`
  const observedTips = sql<number>`(olbg_stats.observed->>'tips')::int`
  const observedLsp = sql<string>`(olbg_stats.observed->>'lsp')::numeric`
  const observedYield = sql<string>`CASE WHEN (olbg_stats.observed->>'tips')::numeric>0 THEN 100*(olbg_stats.observed->>'lsp')::numeric/(olbg_stats.observed->>'tips')::numeric END`
  const period = (n: number, column: SQL<string | null>) => sql<string | null>`CASE WHEN ${tipsters.platform} = 'olbg' THEN ${value(n)} ELSE ${column} END`
  // Small, source-dated registration facts for the approved pilot. No dates
  // are inferred from monthly coverage. Raw receipts are retained privately.
  const joinedDates = Object.fromEntries(registrations.filter(validOlbgRegistration).map(r=>[String(r.profileId),r.joinedAt]))
  const joinedYear = sql<number>`CASE WHEN ((${JSON.stringify(joinedDates)}::jsonb)->>${tipsters.slug}) ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN substring(((${JSON.stringify(joinedDates)}::jsonb)->>${tipsters.slug}) from 1 for 4)::int END`
  const projection = {
    ...base.projection,
    olbgJoinedAt: sql<string|null>`CASE WHEN ${tipsters.platform}='olbg' THEN (${JSON.stringify(joinedDates)}::jsonb)->>${tipsters.slug} ELSE NULL END`,
    olbgObserved: enabled ? sql<unknown>`CASE WHEN ${tipsters.platform}='olbg' THEN olbg_stats.observed ELSE NULL END` : sql<unknown>`NULL::jsonb`,
    picks: observedOr<number>(observedTips, tipsters.picks),
    profit: observedOr<string>(observedLsp, tipsters.profit),
    profitUnit: sql<string>`CASE WHEN ${tipsters.platform} = 'olbg' THEN 'olbg-level-stakes-units' ELSE ${tipsters.profitUnit} END`,
    yield: observedOr<string>(observedYield, tipsters.yield),
    followers: emptyAllTime<number>(tipsters.followers),
    sinceYear: observedOr<number>(joinedYear, tipsters.sinceYear),
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
    // Historical filters and sort already read the same observed figures the
    // card shows; the partial scope is stated on the card itself.
    warnings: () => [],

  }
}
