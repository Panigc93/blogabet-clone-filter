// Import del lote de CATALOGO Tipstrr (capturas API compactas 2026-11-15-api)
// -> Neon produccion. Dry-run por defecto; --apply escribe.
// Autoridad: nota de voz del usuario 2026-11-15 19:16:53 CET ("recoge todo,
// pagado y gratuito, historicos, filtra como consideres, dejalo subido"),
// con las mismas garantias del lote sport/6: puerta estricta de cierre,
// SOLO ALTAS (planSport6Batch), fila+log atomicos, procedencia en
// import_validation_log, ids por secuencia interna, fixtures NUNCA.
//
// Por perfil: /api/portfolio/<slug> + stats/month/6 + stats/sport/6 (rutas
// publicas que usa la propia UI) -> apiCaptureToSnapshot -> puerta
// (overview sport/6, overviewPeriod=6, cierre de 3 cifras contra month/6).
// Lo que no cierra: cuarentena con clase; revenue-faq NO aplica aqui (este
// lote son slugs nuevos, no recuperados).
//
// Uso:
//   DATABASE_URL=<cadena> npx tsx scripts/import-tipstrr-catalog.ts           # dry-run
//   DATABASE_URL=<cadena> npx tsx scripts/import-tipstrr-catalog.ts --apply   # aplica
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { neon } from '@neondatabase/serverless'
import { apiCaptureToSnapshot, type TipstrrApiCapture } from '../crawler/platforms/tipstrr/api-capture'
import {
  tipstrrSnapshotToInsert,
  planSport6Batch,
  assertRealImportProvenance,
} from '../crawler/platforms/tipstrr/to-db'
import type { TipsterInsert } from '../db/schema'

// Copia local de la composición INSERT (misma que la auditada de
// import-tipstrr-prod): NO se importa de allí porque ese módulo ejecuta su
// propio main() al cargarse. Mantener ambas en sync si cambia el esquema.
const COLUMNS: [keyof TipsterInsert, string][] = [
  ['platform', 'platform'], ['slug', 'slug'], ['name', 'name'],
  ['profitUnit', 'profit_unit'], ['priceCurrency', 'price_currency'],
  ['avatarUrl', 'avatar_url'], ['flagUrl', 'flag_url'], ['countryCode', 'country_code'],
  ['isPaid', 'is_paid'], ['price', 'price'], ['sinceYear', 'since_year'],
  ['picks', 'picks'], ['profit', 'profit'], ['yield', 'yield'],
  ['verifiedPct', 'verified_pct'], ['isVerified', 'is_verified'],
  ['followers', 'followers'], ['lastPickAt', 'last_pick_at'],
  ['signupAt', 'signup_at'], ['capturedAt', 'captured_at'],
  ['resetCount', 'reset_count'], ['lastResetAt', 'last_reset_at'],
  ['picks6mAvg', 'picks_6m_avg'], ['yield3m', 'yield_3m'], ['yield6m', 'yield_6m'],
  ['yield12m', 'yield_12m'], ['picksFree3mAvg', 'picks_free_3m_avg'],
  ['yieldFree3m', 'yield_free_3m'], ['statsUpdatedAt', 'stats_updated_at'],
  ['sourcePortfolioId', 'source_portfolio_id'],
]

export function buildInsert(insert: TipsterInsert, internalId: boolean): { text: string; params: unknown[] } {
  const cols: string[] = ['id']
  const vals: string[] = []
  const params: unknown[] = []
  if (internalId) {
    vals.push(`nextval('tipsters_internal_id_seq')`)
  } else {
    params.push(insert.id)
    vals.push(`$${params.length}`)
  }
  for (const [key, col] of COLUMNS) {
    const v = insert[key]
    if (v === undefined) continue
    cols.push(col)
    params.push(v)
    vals.push(`$${params.length}`)
  }
  return {
    text: `INSERT INTO tipsters (${cols.join(', ')}) VALUES (${vals.join(', ')})`,
    params,
  }
}

const APPLY = process.argv.includes('--apply')
const RUN_ID = `tipstrr-catalog-20261115-${APPLY ? 'apply' : 'dryrun'}-${Date.now()}`
const CAP_DIR = 'crawler/platforms/tipstrr/captures/2026-11-15-api'

// PG devuelve numeric como string (igual que en import-tipstrr-prod).
const NUMERIC_KEYS = new Set([
  'price', 'profit', 'yield', 'verifiedPct',
  'picks6mAvg', 'yield3m', 'yield6m', 'yield12m', 'picksFree3mAvg', 'yieldFree3m',
])
const camelize = (row: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    const key = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    out[key] = NUMERIC_KEYS.has(key) && typeof v === 'string' ? Number(v) : v
  }
  return out
}

const skipClass = (reason: string): string => {
  const m = reason.match(/cuarentena\[([^\]]+)\]/)
  if (m) return `cuarentena[${m[1]}]`
  return 'skip[otro]'
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url || url.includes('dummy')) throw new Error('DATABASE_URL ausente o dummy: el import real exige la cadena de producción')
  const sql = neon(url, { fetchOptions: { cache: 'no-store' } })

  // Precondiciones (mismas migraciones que el lote sport/6).
  const cols = await sql.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'tipsters' AND column_name IN ('platform', 'source_portfolio_id')`
  ) as { column_name: string }[]
  if (cols.length !== 2) throw new Error('faltan columnas platform/source_portfolio_id: aplica 0004 y 0005 antes del import')
  const seq = await sql.query(`SELECT 1 FROM pg_sequences WHERE sequencename = 'tipsters_internal_id_seq'`)
  if (seq.length === 0) throw new Error('falta tipstrr_internal_id_seq: aplica 0005 antes del import')
  const logt = await sql.query(`SELECT 1 FROM pg_tables WHERE tablename = 'import_validation_log'`)
  if (logt.length === 0) throw new Error('falta import_validation_log: aplica 0005 antes del import')

  const pre = await sql.query(`SELECT count(*)::text AS n FROM tipsters`) as { n: string }[]
  console.log(`filas tipsters antes: ${pre[0].n} (solo deben sumar inserts Tipstrr nuevos)`)

  if (!existsSync(CAP_DIR)) throw new Error(`sin capturas: ${CAP_DIR} no existe`)
  const files = readdirSync(CAP_DIR).filter((f) => f.endsWith('.json'))
  const summary = { insert: 0, skip: 0, quarantine: 0, errors: 0 }
  const skipDetail: { slug: string; klass: string }[] = []

  for (const f of files) {
    const slug = f.replace(/\.json$/, '')
    let cap: TipstrrApiCapture
    try {
      cap = JSON.parse(readFileSync(join(CAP_DIR, f), 'utf8')) as TipstrrApiCapture
    } catch {
      summary.errors++
      skipDetail.push({ slug, klass: 'error[captura-ilegible]' })
      continue
    }
    const capturedIso = cap._meta?.captured
    if (!capturedIso || Number.isNaN(new Date(capturedIso).getTime())) {
      summary.errors++
      skipDetail.push({ slug, klass: 'error[capturedAt-ausente]' })
      continue
    }
    const snap = apiCaptureToSnapshot(cap)
    const isPaid = cap.portfolio.type === 2
    // Control de cobertura histórica (lección revenue-faq, 2026-11-15): con
    // overviewPeriod=6 la puerta verifica el cierre numérico, pero el cierre
    // NO ve historia previa al primer mes de la serie. Si la serie empieza
    // más de 1 mes después del alta, la completitud no es verificable:
    // cuarentena con el hueco medido. Dudosos aparte, nunca descartados.
    const ordered = [...snap.monthState].sort((a, b) => a.year - b.year || a.month - b.month)
    const first = ordered[0]
    if (first && snap.signupDate) {
      const gap = (first.year - Number(snap.signupDate.slice(0, 4))) * 12 + (first.month - Number(snap.signupDate.slice(5, 7)))
      if (gap > 1) {
        const reason = `cuarentena[cobertura-posterior-alta]: la serie month/6 empieza ${gap} meses después del alta (${snap.signupDate}); el cierre numérico no cubre ese tramo: registro NO persistido, captura y motivo conservados`
        summary.skip++
        summary.quarantine++
        skipDetail.push({ slug, klass: 'cuarentena[cobertura-posterior-alta]' })
        if (APPLY) {
          await sql.transaction((txn) => [
            txn.query(
              `INSERT INTO import_validation_log (platform, slug, captured_at, class, reason, run_id) VALUES ($1, $2, $3, $4, $5, $6)`,
              ['tipstrr', slug, capturedIso, 'cuarentena[cobertura-posterior-alta]', reason, RUN_ID]
            ),
          ])
        }
        continue
      }
    }
    const mapping = tipstrrSnapshotToInsert(snap, {
      id: -1, // placeholder: la secuencia asigna el real en el INSERT
      idSource: 'internal-transactional',
      slug,
      subscriptionPriceGbp: null,
      isPaid,
    })
    assertRealImportProvenance('internal-transactional', slug)

    const existingRows = (await sql.query(
      `SELECT * FROM tipsters WHERE platform = 'tipstrr' AND slug = $1`, [slug]
    )) as Record<string, unknown>[]
    const existing = existingRows.length > 0 ? (camelize(existingRows[0]) as TipsterInsert) : null
    // SOLO ALTAS: una fila existente se preserva intacta (los 198 actuales
    // no se tocan; un solape con ellos quedaria logueado).
    const plan = planSport6Batch(existing, mapping)

    if (plan.action === 'skip-existing') {
      summary.skip++
      skipDetail.push({ slug, klass: 'skip[existente-preservado]' })
      if (APPLY) {
        await sql.transaction((txn) => [
          txn.query(
            `INSERT INTO import_validation_log (platform, slug, captured_at, class, reason, run_id) VALUES ($1, $2, $3, $4, $5, $6)`,
            ['tipstrr', slug, capturedIso, 'skip[existente-preservado]', 'lote catalogo solo-altas: la fila existente se preserva intacta, sin update', RUN_ID]
          ),
        ])
      }
      continue
    }
    if (plan.action === 'skip') {
      summary.skip++
      if (plan.reason.includes('cuarentena')) summary.quarantine++
      skipDetail.push({ slug, klass: skipClass(plan.reason) })
      if (APPLY) {
        await sql.transaction((txn) => [
          txn.query(
            `INSERT INTO import_validation_log (platform, slug, captured_at, class, reason, run_id) VALUES ($1, $2, $3, $4, $5, $6)`,
            ['tipstrr', slug, capturedIso, skipClass(plan.reason), plan.reason, RUN_ID]
          ),
        ])
      }
      continue
    }
    if (!APPLY) {
      summary.insert++
      continue
    }
    // Insert + log de procedencia en UNA transaccion (atomico; reintento seguro).
    const q = buildInsert(plan.insert, true)
    await sql.transaction((txn) => [
      txn.query(q.text, q.params),
      txn.query(
        `INSERT INTO import_validation_log (platform, slug, captured_at, class, reason, run_id) VALUES ($1, $2, $3, $4, $5, $6)`,
        ['tipstrr', slug, capturedIso, 'importado[api-compacta]',
         'overview all-time de /api/portfolio/<slug>/stats/sport/6 y serie de stats/month/6 (captura 2026-11-15); cierre de 3 cifras verificado por la puerta',
         RUN_ID]
      ),
    ])
    summary.insert++
  }

  console.log(JSON.stringify({ runId: RUN_ID, apply: APPLY, summary, skipDetail }, null, 1))

  if (APPLY) {
    const byPlatform = await sql.query(`SELECT platform, count(*)::text AS n FROM tipsters GROUP BY platform ORDER BY platform`)
    const fixtures = await sql.query(
      `SELECT count(*)::text AS n FROM tipsters WHERE id BETWEEN -900999 AND -900000`
    ) as { n: string }[]
    const logCount = await sql.query(
      `SELECT count(*)::text AS n FROM import_validation_log WHERE run_id = $1`, [RUN_ID]
    ) as { n: string }[]
    console.log(JSON.stringify({ byPlatform, fixtureIds: fixtures[0].n, validationLogRows: logCount[0].n }))
    if (fixtures[0].n !== '0') throw new Error('POST-IMPORT: hay ids de fixture en tipsters — abortar y revisar')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
