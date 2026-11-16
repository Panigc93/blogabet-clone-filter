import { and, eq, gte, or, sql, SQL } from 'drizzle-orm'
import { tipsters } from '@/db/schema'
import rawEvidence from '@/data/activity/evidence.json'
import { ActivityEvidence, validEvidence } from './activity'

// Server-side only. Reviewed snapshots, never a second meaning for lastPickAt.
const evidence = (rawEvidence as ActivityEvidence[]).filter(validEvidence)
export function activityCondition(months: number, unknown = false, rows: ActivityEvidence[] = evidence): SQL {
  const cutoff = sql`NOW() - make_interval(months => ${months})`
  const bb = and(eq(tipsters.platform, 'blogabet'), gte(tipsters.lastPickAt, cutoff))!
  const observed = rows.filter(validEvidence).map(e => and(
    eq(tipsters.platform, e.platform), eq(tipsters.slug, e.slug),
    sql`${e.publishedLower}::timestamptz >= ${cutoff}`,
    sql`${e.publishedUpper}::timestamptz <= NOW()`,
    sql`${e.capturedAt}::timestamptz <= NOW()`
  )!)
  const recent = or(bb, ...observed)!
  // COALESCE is required: BB's NULL lastPickAt must remain unknown, not vanish.
  return unknown ? sql`NOT COALESCE(${recent}, false)` : recent
}

export function activityWarning(months?: number, unknown?: boolean): string | null {
  if (months === undefined && !unknown) return null
  if (unknown) return 'Sin publicación comprobada en el último mes. Incluye datos ausentes, parciales o antiguos: NO significa inactivo. Blogabet conserva su aproximación del catálogo.'
  const coverage = `Capturas con fecha aprovechable: Golazobets ${new Set(evidence.filter(e => e.platform === 'golazobets').map(e => e.slug)).size}; Tipstrr ${new Set(evidence.filter(e => e.platform === 'tipstrr').map(e => e.slug)).size}. `
  return coverage + 'Actividad comprobada por una publicación dentro del periodo, según capturas parciales (no es necesariamente la última publicación). Sin prueba reciente queda fuera, no se clasifica como inactivo. Blogabet conserva su aproximación del catálogo. No hay actualización automática.'
}
