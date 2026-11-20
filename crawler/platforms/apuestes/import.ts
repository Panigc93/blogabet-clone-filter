// Ruta de import Apuestes: idempotente, transaccional, sin tocar otras
// plataformas. Hoy solo la ejecuta el entorno local aislado (PGlite vía
// scripts/seed-apuestes-local.ts); la carga en Neon requiere aprobación.
//
// - Clave operativa (platform, slug): upsert ON CONFLICT ux_tipsters_platform_slug.
// - PK: NO se usa -id del origen (no garantiza ausencia de colisiones con el
//   espacio negativo de otras plataformas, p.ej. -portfolioId de Tipstrr).
//   Se usa el mecanismo existente seguro: la secuencia interna
//   tipsters_internal_id_seq (0005, desde -2.000.000.000 hacia abajo),
//   asignada con nextval dentro de la transacción SOLO en filas nuevas;
//   en conflicto el id existente nunca se toca. idSource 'internal-transactional'.
// - Ausencia vs vacío: el mapping nunca emite null por falta de dato (esa
//   fila queda held); un null nuevo es un VACÍO VERDADERO (ventana con
//   picks=0 explícito). Por eso el update SOBREESCRIBE todas las columnas
//   gestionadas, nulls incluidos: una ventana poblada→vacía pone su yield a
//   NULL en vez de conservar el antiguo.
// - Holds (cuarentena/discrepancia/meses/rango) se registran en
//   import_validation_log con run_id por ejecución (un log crece; las filas
//   de tipsters no).
import { sql } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import { tipsters, importValidationLog } from '@/db/schema'
import {
  apuestesRowToInsert, resolveApuestesSlug,
  type ApuestesCaptureRow, type ApuestesDbMapping,
} from './to-db'

export interface ApuestesImportPlan {
  inserts: ReturnType<typeof rowsToInserts>['inserts']
  holds: { platform: string; slug: string; klass: string; reason: string }[]
  rows: number
}

function rowsToInserts(rows: ApuestesCaptureRow[], urls: Record<string, string>) {
  const taken = new Set<string>()
  const inserts = []
  const holds = []
  for (const r of rows) {
    const slug = resolveApuestesSlug(r.username, r.id, taken)
    // id placeholder 0: el executor asigna nextval('tipsters_internal_id_seq')
    // en transacción para filas nuevas; en conflicto conserva el id existente.
    const m: ApuestesDbMapping = apuestesRowToInsert(r, {
      id: 0,
      idSource: 'internal-transactional',
      slug,
      sourceUrl: urls[String(r.id)] ?? null,
    })
    if (m.ok) inserts.push(m.insert)
    else holds.push({ platform: 'apuestes', slug, klass: m.klass, reason: m.reason })
  }
  return { inserts, holds }
}

// Plan puro: ninguna escritura. Testable sin DB.
export function planApuestesImport(jsonlPath: string, urlsPath: string): ApuestesImportPlan {
  const rows = readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean)
    .map(l => JSON.parse(l) as ApuestesCaptureRow)
  const urls = JSON.parse(readFileSync(urlsPath, 'utf8')) as Record<string, string>
  const { inserts, holds } = rowsToInserts(rows, urls)
  return { inserts, holds, rows: rows.length }
}

// Ejecuta el plan sobre una base ya migrada en UNA transacción: todos los
// lotes de upsert y el log de holds se confirman o se revierten juntos.
// Un fallo en cualquier lote no deja filas parciales (rollback demostrado
// en scripts/apuestes-import-regression.ts). Idempotente: misma captura ->
// mismas filas. Devuelve conteos para verificación.
export async function executeApuestesImport(
  db: { insert: Function; transaction: Function },
  plan: ApuestesImportPlan,
  runId: string,
): Promise<{ upserted: number; holdsLogged: number }> {
  // Sobrescritura completa de columnas gestionadas (ver contrato ausencia
  // vs vacío arriba); id/platform/slug jamás se actualizan en conflicto.
  // OJO: las claves de `set` son los nombres de propiedad de drizzle
  // (camelCase); una clave snake_case se ignora en silencio y la columna no
  // se actualiza (bug detectado por scripts/apuestes-import-regression.ts).
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
