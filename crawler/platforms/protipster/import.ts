// Ruta de import ProTipster: idempotente, transaccional, sin tocar otras
// plataformas. Sin ejecutora real todavía: la carga en Neon requiere
// aprobación explícita del dueño (producción DB).
//
// Mismo contrato que Apuestes (crawler/platforms/apuestes/import.ts):
// - Clave operativa (platform, slug): upsert ON CONFLICT ux_tipsters_platform_slug.
// - PK: secuencia interna tipsters_internal_id_seq asignada con nextval
//   dentro de la transacción SOLO en filas nuevas; en conflicto el id
//   existente nunca se toca. idSource 'internal-transactional'.
// - Ausencia vs vacío: el mapping nunca emite null por falta de dato (esa
//   fila queda held); un null nuevo es un VACÍO VERDADERO (ventana con
//   picks=0 explícito). El update SOBREESCRIBE todas las columnas
//   gestionadas, nulls incluidos.
// - Holds se registran en import_validation_log con run_id por ejecución.
import { sql } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import { tipsters, importValidationLog } from '@/db/schema'
import {
  protipsterRowToInsert,
  type ProtipsterDbMapping,
} from './to-db'
import type { ProtipsterCaptureRow } from './types'

export interface ProtipsterImportPlan {
  inserts: ReturnType<typeof rowsToInserts>['inserts']
  holds: { platform: string; slug: string; klass: string; reason: string }[]
  rows: number
}

function rowsToInserts(rows: ProtipsterCaptureRow[]) {
  const taken = new Set<string>()
  const inserts = []
  const holds = []
  for (const r of rows) {
    // usernameCanonical is already the site's URL slug; collisions inside the
    // platform are not expected, but the taken-set keeps the contract.
    const base = r.overview?.usernameCanonical || r.slug
    const slug = taken.has(base) ? `${base}-${r.overview?.id ?? 'x'}` : base
    taken.add(slug)
    // id placeholder 0: el executor asigna nextval('tipsters_internal_id_seq')
    // en transacción para filas nuevas; en conflicto conserva el id existente.
    const m: ProtipsterDbMapping = protipsterRowToInsert(r, {
      id: 0,
      idSource: 'internal-transactional',
      slug,
      sourceUrl: r.sourceUrl ?? null,
    })
    if (m.ok) inserts.push(m.insert)
    else holds.push({ platform: 'protipster', slug, klass: m.klass, reason: m.reason })
  }
  return { inserts, holds }
}

// Plan puro: ninguna escritura. Testable sin DB.
export function planProtipsterImport(jsonlPath: string): ProtipsterImportPlan {
  const rows = readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean)
    .map(l => JSON.parse(l) as ProtipsterCaptureRow)
  const { inserts, holds } = rowsToInserts(rows)
  return { inserts, holds, rows: rows.length }
}

// Ejecuta el plan sobre una base ya migrada en UNA transacción: todos los
// lotes de upsert y el log de holds se confirman o se revierten juntos.
// OJO: las claves de `set` son los nombres de propiedad de drizzle
// (camelCase); una clave snake_case se ignora en silencio (bug real
// detectado en la ruta apuestes).
export async function executeProtipsterImport(
  db: { insert: Function; transaction: Function },
  plan: ProtipsterImportPlan,
  runId: string,
): Promise<{ upserted: number; holdsLogged: number }> {
  const OVERWRITE_COLS: [string, string][] = [
    ['name', 'name'], ['profitUnit', 'profit_unit'], ['priceCurrency', 'price_currency'],
    ['avatarUrl', 'avatar_url'], ['flagUrl', 'flag_url'], ['countryCode', 'country_code'],
    ['isPaid', 'is_paid'], ['price', 'price'], ['sinceYear', 'since_year'],
    ['picks', 'picks'], ['profit', 'profit'], ['yield', 'yield'],
    ['verifiedPct', 'verified_pct'], ['isVerified', 'is_verified'],
    ['followers', 'followers'], ['lastPickAt', 'last_pick_at'], ['signupAt', 'signup_at'],
    ['capturedAt', 'captured_at'], ['resetCount', 'reset_count'], ['lastResetAt', 'last_reset_at'],
    ['picks6mAvg', 'picks_6m_avg'], ['yield3m', 'yield_3m'], ['yield6m', 'yield_6m'], ['yield12m', 'yield_12m'],
    ['picksFree3mAvg', 'picks_free_3m_avg'], ['yieldFree3m', 'yield_free_3m'], ['statsUpdatedAt', 'stats_updated_at'],
    ['sourcePortfolioId', 'source_portfolio_id'], ['sourceUrl', 'source_url'],
  ]
  const overwriteSet = Object.fromEntries(OVERWRITE_COLS.map(([k, c]) => [k, sql.raw(`excluded."${c}"`)]))

  let upserted = 0
  await (db.transaction as Function)(async (tx: any) => {
    for (let i = 0; i < plan.inserts.length; i += 200) {
      const batch = plan.inserts.slice(i, i + 200).map(v => ({
        ...v,
        id: sql`nextval('tipsters_internal_id_seq')`,
      }))
      await (tx.insert(tipsters) as any)
        .values(batch)
        .onConflictDoUpdate({ target: [tipsters.platform, tipsters.slug], set: overwriteSet })
      upserted += batch.length
    }
    if (plan.holds.length) {
      await (tx.insert(importValidationLog) as any).values(
        plan.holds.map(h => ({ ...h, runId })),
      )
    }
  })
  return { upserted, holdsLogged: plan.holds.length }
}
