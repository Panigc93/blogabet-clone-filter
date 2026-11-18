import { and, eq, getTableColumns, sql, type SQL } from 'drizzle-orm'
import { tipsters } from '@/db/schema'
import { validAudit, type PeriodAudit, type PeriodMonths } from './bet2invest-period-contract'
import { sortOrder, type SortField } from './query'

/** All requests must use the SAME object for SELECT and ORDER BY before LIMIT.
 * Metadata is an explicitly supplied private, receipt-verified artifact index.
 * No raw files or filesystem paths are sent to the client.
 */
export function periodReadContext(audits: PeriodAudit[], now = new Date()) {
  const keys = audits.map((a) => `${a.slug}\n${a.capturedAt}`)
  if (new Set(keys).size !== keys.length) throw new Error('duplicate audit identity')
  const active = audits.filter(validAudit).filter((a) => {
    const at = new Date(a.capturedAt)
    return at <= now && a.capturedAt.slice(0, 7) === now.toISOString().slice(0, 7)
  })
  const source = sql`jsonb_to_recordset(${JSON.stringify(active)}::jsonb) AS b2i_audit(slug text, "capturedAt" text, windows jsonb)`
  const joinOn = and(eq(tipsters.platform, 'bet2invest'), sql`b2i_audit.slug = ${tipsters.slug}`,
    sql`b2i_audit."capturedAt"::timestamptz = ${tipsters.capturedAt}`)!
  const audit = sql<PeriodAudit | null>`CASE WHEN ${tipsters.platform} = 'bet2invest' AND b2i_audit.slug IS NOT NULL THEN jsonb_build_object('slug', b2i_audit.slug, 'capturedAt', b2i_audit."capturedAt", 'windows', b2i_audit.windows) ELSE NULL END`
  const effective = (n: PeriodMonths, col: typeof tipsters.yield3m | typeof tipsters.yield6m | typeof tipsters.yield12m) => sql<string | null>`CASE WHEN ${tipsters.platform} = 'bettingexpert' THEN NULL WHEN ${tipsters.platform} != 'bet2invest' THEN ${col} WHEN (b2i_audit.windows->${String(n)}->>'value')::numeric = ${col} THEN ${col} ELSE NULL END`
  const columns = { yield3m: effective(3, tipsters.yield3m), yield6m: effective(6, tipsters.yield6m), yield12m: effective(12, tipsters.yield12m) }
  return {
    source, joinOn, projection: { ...getTableColumns(tipsters), ...columns, picks6mAvg: sql<string | null>`CASE WHEN ${tipsters.platform} = 'bettingexpert' THEN NULL ELSE ${tipsters.picks6mAvg} END`, picksFree3mAvg: sql<string | null>`CASE WHEN ${tipsters.platform} = 'bettingexpert' THEN NULL ELSE ${tipsters.picksFree3mAvg} END`, yieldFree3m: sql<string | null>`CASE WHEN ${tipsters.platform} = 'bettingexpert' THEN NULL ELSE ${tipsters.yieldFree3m} END`, b2iAudit: audit },
    order: (sort: SortField): SQL[] => {
      const col = sort === 'yield6m' ? columns.yield6m : sort === 'yield12m' ? columns.yield12m : null
      return col ? [sql`${col} DESC NULLS LAST`, sql`${tipsters.id} DESC`] : sortOrder(sort)
    },
    now,
  }
}
