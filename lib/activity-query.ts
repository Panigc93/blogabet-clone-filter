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
function apuestesWindow(months: number): SQL | null {
  const col = months === 3 ? tipsters.yield3m
    : months === 6 ? tipsters.yield6m
    : months === 12 ? tipsters.yield12m
    : null
  return col ? and(eq(tipsters.platform, 'apuestes'), isNotNull(col))! : null
}

export function activityCondition(months: number, unknown = false, rows: ActivityEvidence[] = evidence): SQL {
  const cutoff = sql`NOW() - make_interval(months => ${months})`
  const bb = and(eq(tipsters.platform, 'blogabet'), gte(tipsters.lastPickAt, cutoff))!
  const ap = apuestesWindow(months)
  const observed = rows.filter(validEvidence).map(e => and(
    eq(tipsters.platform, e.platform), eq(tipsters.slug, e.slug),
    sql`${e.publishedLower}::timestamptz >= ${cutoff}`,
    sql`${e.publishedUpper}::timestamptz <= NOW()`,
    sql`${e.capturedAt}::timestamptz <= NOW()`
  )!)
  const recent = or(bb, ...(ap ? [ap] : []), ...observed)!
  // COALESCE is required: BB's NULL lastPickAt must remain unknown, not vanish.
  return unknown ? sql`NOT COALESCE(${recent}, false)` : recent
}

export function activityWarning(months?: number, unknown?: boolean): string | null {
  if (months === undefined && !unknown) return null
  if (unknown) return 'Sin publicación comprobada en el último mes. Incluye datos ausentes, parciales o antiguos: NO significa inactivo. Blogabet conserva su aproximación del catálogo.'
  const dates = evidence.map(e => e.capturedAt).sort()
  const range = dates.length ? ` Fechas de captura: ${dates[0]} a ${dates[dates.length - 1]}. ` : ' Sin fechas de captura disponibles. '
  const coverage = `Capturas con fecha aprovechable: Golazobets ${new Set(evidence.filter(e => e.platform === 'golazobets').map(e => e.slug)).size}; Tipstrr ${new Set(evidence.filter(e => e.platform === 'tipstrr').map(e => e.slug)).size}. Apuestes usa las ventanas cerradas de 3, 6 y 12 meses de su captura (19-20 nov 2026); el último mes no está disponible en Apuestes. `
  return coverage + range + 'Actividad comprobada por una publicación dentro del periodo, según capturas parciales (no es necesariamente la última publicación). Sin prueba reciente queda fuera, no se clasifica como inactivo. Blogabet conserva su aproximación del catálogo. No hay actualización automática.'
}
