// Import del lote GOLAZOBETS (catalogo + perfiles capturados 2026-11-15)
// -> Neon produccion. Dry-run por defecto; --apply escribe.
//
// ESTADO DE AUTORIDAD (2026-11-16): la captura publica esta hecha bajo la
// decision del usuario con incertidumbre juridica abierta (mismo precedente
// que Tipstrr), pero PRODUCCION golazobets sigue PENDIENTE de autorizacion
// expresa de alcance por main. Este script existe para revision: --apply NO
// debe ejecutarse hasta esa autorizacion y la revision independiente de la
// puerta (docs/golazobets-import.md).
//
// Garantias heredadas del pipeline Tipstrr: puerta estricta por perfil,
// SOLO ALTAS, fila+log atomicos, procedencia en import_validation_log, ids
// por secuencia interna, buildInsert compartido (insert-sql.ts, probado con
// PGlite), fixtures NUNCA, ausentes=null, huella de preexistentes invariante.
//
// Uso:
//   DATABASE_URL=<cadena> npx tsx scripts/import-golazobets-catalog.ts           # dry-run
//   DATABASE_URL=<cadena> npx tsx scripts/import-golazobets-catalog.ts --apply   # BLOQUEADO hasta autorizacion
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { neon } from '@neondatabase/serverless'
import {
  golazobetsCaptureToInsert,
  golazobetsClosureGate,
  type GzbProfileCapture,
} from '../crawler/platforms/golazobets/to-db'
import { buildInsert } from '../crawler/platforms/tipstrr/insert-sql'

const APPLY = process.argv.includes('--apply')
const RUN_ID = `golazobets-catalog-20261116-${APPLY ? 'apply' : 'dryrun'}-${Date.now()}`
const CAP_DIR = 'crawler/platforms/golazobets/captures/2026-11-15-profiles'
const CAPTURED_AT = '2026-11-15'

// Huella de filas EXISTENTES: el lote es solo-altas; la huella de las
// preexistentes debe ser invariante (mismo criterio que los lotes Tipstrr).
const HUELLA_SQL = `SELECT md5(string_agg(t::text, '|' ORDER BY id)) AS h, count(*)::text AS n FROM tipsters t`

async function main() {
  const url = process.env.DATABASE_URL
  if (!url || url.includes('dummy')) throw new Error('DATABASE_URL ausente o dummy: el import real exige la cadena de produccion')
  const sql = neon(url, { fetchOptions: { cache: 'no-store' } })

  const seq = await sql.query(`SELECT 1 FROM pg_sequences WHERE sequencename = 'tipsters_internal_id_seq'`)
  if (seq.length === 0) throw new Error('falta tipsters_internal_id_seq: aplica 0005 antes del import')
  const logt = await sql.query(`SELECT 1 FROM pg_tables WHERE tablename = 'import_validation_log'`)
  if (logt.length === 0) throw new Error('falta import_validation_log: aplica 0005 antes del import')

  const pre = (await sql.query(HUELLA_SQL)) as { h: string; n: string }[]
  console.log(`filas tipsters antes: ${pre[0].n} | huella md5: ${pre[0].h}`)

  if (!existsSync(CAP_DIR)) throw new Error(`sin capturas: ${CAP_DIR} no existe`)
  const files = readdirSync(CAP_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  const summary = { insert: 0, skip: 0, quarantine: 0, errors: 0 }
  const skipDetail: { slug: string; klass: string }[] = []
  const insertedSlugs: string[] = []

  for (const f of files) {
    const slug = f.replace(/\.json$/, '')
    let cap: GzbProfileCapture
    try {
      cap = JSON.parse(readFileSync(join(CAP_DIR, f), 'utf8')) as GzbProfileCapture
    } catch {
      summary.errors++
      skipDetail.push({ slug, klass: 'error[captura-ilegible]' })
      continue
    }
    const gate = golazobetsClosureGate(cap)
    if (!gate.ok) {
      summary.skip++
      summary.quarantine++
      skipDetail.push({ slug, klass: gate.clase })
      if (APPLY) {
        await sql.transaction((txn) => [
          txn.query(
            `INSERT INTO import_validation_log (platform, slug, captured_at, class, reason, run_id) VALUES ($1, $2, $3, $4, $5, $6)`,
            ['golazobets', slug, CAPTURED_AT, gate.clase, gate.razon, RUN_ID]
          ),
        ])
      }
      continue
    }
    const mapping = golazobetsCaptureToInsert(slug, cap, { capturedAt: CAPTURED_AT })
    if (!mapping.ok) {
      summary.errors++
      skipDetail.push({ slug, klass: 'error[mapeo]' })
      continue
    }
    const existing = (await sql.query(
      `SELECT 1 FROM tipsters WHERE platform = 'golazobets' AND slug = $1`, [slug]
    )) as unknown[]
    if (existing.length > 0) {
      summary.skip++
      skipDetail.push({ slug, klass: 'skip[existente-preservado]' })
      if (APPLY) {
        await sql.transaction((txn) => [
          txn.query(
            `INSERT INTO import_validation_log (platform, slug, captured_at, class, reason, run_id) VALUES ($1, $2, $3, $4, $5, $6)`,
            ['golazobets', slug, CAPTURED_AT, 'skip[existente-preservado]', 'lote solo-altas: la fila existente se preserva intacta', RUN_ID]
          ),
        ])
      }
      continue
    }
    if (!APPLY) {
      summary.insert++
      continue
    }
    const q = buildInsert(mapping.insert, true)
    await sql.transaction((txn) => [
      txn.query(q.text, q.params),
      txn.query(
        `INSERT INTO import_validation_log (platform, slug, captured_at, class, reason, run_id) VALUES ($1, $2, $3, $4, $5, $6)`,
        ['golazobets', slug, CAPTURED_AT, 'importado[catalogo+perfil]',
         'cabecera tipster_stats y serie mensual all-time del perfil (captura 2026-11-15); cierre por solape de intervalos de redondeo (golazobetsClosureGate): '
         + `diffs medidas picks=${gate.diffs.picks} profit=${gate.diffs.profit.toFixed(4)} yield=${gate.diffs.yield.toFixed(4)}pp, intervalo yield [${gate.diffs.yieldLo.toFixed(3)}, ${gate.diffs.yieldHi.toFixed(3)}] (${gate.diffs.months} filas); solape = compatibilidad con redondeo, no causalidad`,
         RUN_ID]
      ),
    ])
    insertedSlugs.push(slug)
    summary.insert++
  }

  console.log(JSON.stringify({ runId: RUN_ID, apply: APPLY, summary, skipDetail }, null, 1))

  if (APPLY) {
    const post = (await sql.query(HUELLA_SQL)) as { h: string; n: string }[]
    const byPlatform = await sql.query(`SELECT platform, count(*)::text AS n FROM tipsters GROUP BY platform ORDER BY platform`)
    const fixtures = await sql.query(`SELECT count(*)::text AS n FROM tipsters WHERE id BETWEEN -900999 AND -900000`) as { n: string }[]
    const logCount = await sql.query(`SELECT count(*)::text AS n FROM import_validation_log WHERE run_id = $1`, [RUN_ID]) as { n: string }[]
    console.log(JSON.stringify({ despues: post[0], esperadoN: String(Number(pre[0].n) + summary.insert), byPlatform, fixtureIds: fixtures[0].n, validationLogRows: logCount[0].n }))
    if (fixtures[0].n !== '0') throw new Error('POST-IMPORT: hay ids de fixture en tipsters')
    if (Number(post[0].n) !== Number(pre[0].n) + summary.insert) throw new Error('POST-IMPORT: el recuento no cuadra')
    if (insertedSlugs.length === 0) {
      if (post[0].h !== pre[0].h) throw new Error('POST-IMPORT: la huella cambio sin inserts')
    } else {
      const preHuella = (await sql.query(
        `SELECT md5(string_agg(t::text, '|' ORDER BY id)) AS h FROM tipsters t WHERE NOT (platform = 'golazobets' AND slug = ANY($1))`,
        [insertedSlugs]
      )) as { h: string }[]
      if (preHuella[0].h !== pre[0].h) throw new Error('POST-IMPORT: la huella de las filas preexistentes cambio')
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
