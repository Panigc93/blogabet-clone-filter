import { sql, and, eq, gte, lte, type SQL } from 'drizzle-orm'
import { tipsters } from '@/db/schema'
import { buildFilters, type TipsterFilters, type SortField } from './query'
import { periodReadContext } from './bet2invest-period-read'
import { eligibleMonthlyRecord, recordSummaries, type OlbgMonthlyRecord } from '@/crawler/platforms/olbg/monthly-record'

// NOT wired to routes. Compose over the B2I context so its own audit and period
// masks survive. SELECT, filters and ORDER BY must all use this one context.
export function olbgReadContext(base: ReturnType<typeof periodReadContext>, records: OlbgMonthlyRecord[], now = base.now) {
  if (new Set(records.map(r => r.profileId)).size !== records.length) throw new Error('Duplicate OLBG active identity')
  const active = records.filter(r => eligibleMonthlyRecord(r, now)).map(r => ({
    slug: String(r.profileId), capturedAt: r.capturedAt,
    // This is public statistical evidence only, without source receipt hashes,
    // bytes, paths, account fields or a fabricated all-time record.
    evidence: { profileId: r.profileId, username: r.username, profileUrl: r.profileUrl,
      capturedAt: r.capturedAt, sourceMonth: r.sourceMonth, months: r.months },
    windows: Object.fromEntries(recordSummaries(r).map(w => [w.closedMonths, {
      value: w.derivedLevelStakesYieldPct, tips: w.tips, from: w.fromMonth, through: w.throughMonth,
    }])),
  }))
  const source = sql`jsonb_to_recordset(${JSON.stringify(active)}::jsonb) AS olbg_stats(slug text, "capturedAt" text, evidence jsonb, windows jsonb)`
  const joinOn = and(sql`${tipsters.platform} = 'olbg'`, sql`${tipsters.slug} = olbg_stats.slug`, sql`${tipsters.capturedAt} = olbg_stats."capturedAt"::timestamptz`)!
  const emptyAllTime = <T>(column: SQL<T> | object) => sql<T | null>`CASE WHEN ${tipsters.platform} = 'olbg' THEN NULL ELSE ${column} END`
  const period = (n: number, column: SQL<string | null>) => sql<string | null>`CASE WHEN ${tipsters.platform} = 'olbg' THEN (olbg_stats.windows->${String(n)}->>'value')::numeric ELSE ${column} END`
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
    picks6mAvg: sql<string | null>`CASE WHEN ${tipsters.platform} = 'olbg' THEN (olbg_stats.windows->'6'->>'tips')::numeric / 6 ELSE ${tipsters.picks6mAvg} END`,
    olbgEvidence: sql<unknown>`CASE WHEN ${tipsters.platform} = 'olbg' THEN olbg_stats.evidence ELSE NULL END`,
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
    acceptedRecords: active.length,
    maskedRecords: records.length - active.length,
  }
}
