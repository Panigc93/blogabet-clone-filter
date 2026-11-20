import { and, eq, gte, isNotNull, or, sql, SQL } from 'drizzle-orm'
import { tipsters } from '@/db/schema'
import rawEvidence from '@/data/activity/evidence.json'
import { ActivityEvidence, validEvidence } from './activity'

// Server-side only. Reviewed snapshots, never a second meaning for lastPickAt.
const evidence = (rawEvidence as ActivityEvidence[]).filter(validEvidence)

// Apuestes has no per-pick dates in the DB (lastPickAt stays NULL: the source
// gives month granularity only). Its activity evidence is the capture's
// rolling 3/6/12-month windows, imported as yield_3m/yield_6m/yield_12m: a
// window imported non-NULL means the profile had picks inside that window at
// capture time (2026-11-19/20). Exact window match only: a shorter filter is
// never widened into a longer window, and months outside {3,6,12} (e.g.
// "último mes") have no Apuestes evidence. Verified against prod 2026-11-20:
// non-NULL counts 106/151/281, and picks_6m_avg is NULL exactly when
// yield_6m is (window with 0 picks imports both NULL).
//
// Bet2Invest is the same shape: last_pick_at stays NULL (month granularity),
// and its yield_3m/yield_6m/yield_12m columns carry complete calendar months
// before capture (2026-11-17), not rolling windows. The joined b2i_audit
// source contains only validated audits from the current month, matched to
// the row's exact capture; its value must also match the raw column.
//
// ProTipster is also the Apuestes shape: last_pick_at stays NULL. Its
// yield_3m/yield_6m are the site's own rolling windows at capture and
// yield_12m the 12 complete calendar months before capture (user-approved
// definition 2026-11-20); the import writes NULL when the window has 0
// picks or the capture is held for inconsistency, so a non-NULL column is
// activity evidence for that exact window. Exact window match only.
function capturedWindow(platform: 'apuestes' | 'bet2invest' | 'protipster', months: number): SQL | null {
  const col = months === 3 ? tipsters.yield3m
    : months === 6 ? tipsters.yield6m
    : months === 12 ? tipsters.yield12m
    : null
  if (!col) return null
  if (platform === 'bet2invest') return and(eq(tipsters.platform, platform),
    sql`(b2i_audit.windows->${String(months)}->>'value')::numeric = ${col}`,
    sql`(b2i_audit.windows->${String(months)}->>'bets')::integer > 0`)!
  return and(eq(tipsters.platform, platform), isNotNull(col))!
}

// Bettingexpert has no per-pick dates either; its reviewed 3/6/12m windows
// come from the be_research join (release or research evidence). A window
// with picks has a numeric value; 'Sin dato' means no eligible sample in
// that window. Exact window match only; months outside {3,6,12} have no BE
// evidence. The be_research alias is joined by every query that applies this
// condition (page and API both leftJoin the research source).
function bettingexpertWindow(months: number): SQL | null {
  const w = months === 3 ? '3m' : months === 6 ? '6m' : months === 12 ? '12m' : null
  return w ? and(eq(tipsters.platform, 'bettingexpert'),
    sql`(be_research.public->'windows'->${w}->>'value') IS NOT NULL`,
    sql`(be_research.public->'windows'->${w}->>'picks')::integer > 0`)! : null
}

// OLBG (non-monthly read path only; production serves OLBG through the
// published-monthly route, which applies its own month-level activity
// evidence): the joined compact windows carry tips per captured 3/6/12m
// window. tips>0 means picks inside that window at capture. Exact window
// match only. The olbg_stats alias is joined by every query that applies
// this condition.
function olbgWindow(months: number): SQL | null {
  const idx = months === 3 ? 0 : months === 6 ? 1 : months === 12 ? 2 : null
  return idx === null ? null : and(eq(tipsters.platform, 'olbg'),
    sql`(olbg_stats.compact->'windows'->(${idx}::int)->>'tips')::numeric > 0`)!
}

export function activityCondition(months: number, unknown = false, rows: ActivityEvidence[] = evidence): SQL {
  const cutoff = sql`NOW() - make_interval(months => ${months})`
  const bb = and(eq(tipsters.platform, 'blogabet'), gte(tipsters.lastPickAt, cutoff))!
  const captured = [capturedWindow('apuestes', months), capturedWindow('bet2invest', months), capturedWindow('protipster', months), bettingexpertWindow(months), olbgWindow(months)].filter((c): c is SQL => c !== null)
  const observed = rows.filter(validEvidence).map(e => and(
    eq(tipsters.platform, e.platform), eq(tipsters.slug, e.slug),
    sql`${e.publishedLower}::timestamptz >= ${cutoff}`,
    sql`${e.publishedUpper}::timestamptz <= NOW()`,
    sql`${e.capturedAt}::timestamptz <= NOW()`
  )!)
  const recent = or(bb, ...captured, ...observed)!
  // COALESCE is required: BB's NULL lastPickAt must remain unknown, not vanish.
  return unknown ? sql`NOT COALESCE(${recent}, false)` : recent
}

export function activityWarning(months?: number, unknown?: boolean): string | null {
  if (months === undefined && !unknown) return null
  if (unknown) return 'Sin prueba en el último mes disponible: ventana móvil cuando hay fechas; último mes completo para OLBG. Apuestes, Bet2Invest, Bettingexpert y ProTipster no tienen prueba de 1 mes. Incluye datos ausentes, parciales o antiguos: NO significa inactivo. Blogabet conserva su aproximación del catálogo.'
  const dates = evidence.map(e => e.capturedAt).sort()
  const range = dates.length ? ` Fechas de captura: ${dates[0]} a ${dates[dates.length - 1]}. ` : ' Sin fechas de captura disponibles. '
  const coverage = `Capturas con fecha aprovechable: Golazobets ${new Set(evidence.filter(e => e.platform === 'golazobets').map(e => e.slug)).size}; Tipstrr ${new Set(evidence.filter(e => e.platform === 'tipstrr').map(e => e.slug)).size}. Apuestes usa ventanas móviles de 3, 6 y 12 meses en la captura del 19-20 nov 2026. Bet2Invest (captura 17 nov 2026) y Bettingexpert usan los 3, 6 y 12 meses completos anteriores al mes de captura; no son ventanas móviles. ProTipster usa 3m/6m móviles y 12 meses naturales completos (nov 2025 a oct 2026), captura 20 nov 2026. El último mes no está disponible en esas cuatro plataformas. OLBG usa los meses completos anteriores a su captura que tengan picks publicados. `
  return coverage + range + 'Prueba de actividad dentro de las ventanas indicadas, según capturas parciales; no equivale a la última publicación. Sin prueba queda fuera, no se clasifica como inactivo. Blogabet conserva su aproximación del catálogo. No hay actualización automática.'
}
