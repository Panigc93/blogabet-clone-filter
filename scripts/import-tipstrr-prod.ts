import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
// Import REAL Tipstrr -> Neon producción (Superblogabet). Dry-run por
// defecto; --apply escribe. Autorización: despliegue 98 verificados
// (17:57/18:01 CET); fixtures NUNCA son payload.
//
// Precondiciones verificadas al arrancar (falla ruidoso si falta):
//   0004 aplicado (tipsters.platform), 0005 aplicado
//   (tipsters.source_portfolio_id, import_validation_log,
//   tipsters_internal_id_seq).
//
// Por perfil, UNA transacción atómica (batch HTTP de Neon):
//   - id: el de la fila existente si ya existe (update); -portfolioId si
//     viene capturado del origen (idSource 'source-captured', hoy solo TLE);
//     si no, nextval('tipsters_internal_id_seq') literal en el propio INSERT
//     (idSource 'internal-transactional': generado por la ruta en su
//     transacción, nunca declarado por un llamador externo).
//   - assertRealImportProvenance ANTES de componer cualquier write.
//   - planTipstrrUpsert decide insert/update/skip (cuarentena y frescura
//     conservadora); merge preserva-ausentes, identidad inmutable.
//   - skip => fila en import_validation_log (misma transacción): la
//     validación fallida queda registrada fuera de la fila de tipsters.
// Dry-run: calcula los mismos planes sin escribir ni consumir secuencia.
//
// Uso:
//   DATABASE_URL=<cadena> npx tsx scripts/import-tipstrr-prod.ts           # dry-run
//   DATABASE_URL=<cadena> npx tsx scripts/import-tipstrr-prod.ts --apply   # aplica
//
// La cadena se lee de la variable de entorno; nunca se imprime. Rollback y
// huella de integridad BB: docs/deploy-tipstrr-prod.md (runbook).
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { neon } from '@neondatabase/serverless'
import { loadTipstrrCapture, type TipstrrStatsCapture } from '../crawler/platforms/tipstrr/load-capture'
import { sport6Totals, applySport6AllTime, type Sport6Capture } from '../crawler/platforms/tipstrr/sport6'
import {
  tipstrrSnapshotToInsert,
  planSport6Batch,
  assertRealImportProvenance,
  type TipstrrIdSource,
} from '../crawler/platforms/tipstrr/to-db'
import type { TipsterInsert } from '../db/schema'

const APPLY = process.argv.includes('--apply')
// run_id único por ejecución: un reintento no mezcla filas de log con la
// pasada anterior (cuenta por clase/run, nunca log==111 asumido).
const RUN_ID = `tipstrr-prod-20261115-${APPLY ? 'apply' : 'dryrun'}-${Date.now()}`
const CAP_DIR = 'crawler/platforms/tipstrr/captures/2026-11-15-stats'
const TLE_CAPTURE = 'crawler/platforms/tipstrr/captures/2026-11-15-tle-stats-state.json'
// Totales all-time advised independientes (recuperación 2026-11-15 de los 111
// cuyo overview embebido no era all-time). Solo existen para esos 111; cuando
// hay captura sport/6, SUSTITUYE el overview y la puerta estricta re-verifica
// el cierre de 3 cifras contra la serie mensual embebida.
const SPORT6_DIR = 'crawler/platforms/tipstrr/captures/2026-11-15-sport6'
const SPORT6_LABEL = 'captura 2026-11-15'
const sport6Slugs = new Set(
  existsSync(SPORT6_DIR) ? readdirSync(SPORT6_DIR).map((f) => f.replace(/\.json$/, '')) : []
)
// Cierre numérico OK pero histórico NO validado: revenue-faq cerró las 3
// cifras y sin embargo su serie empieza ~1 año después del alta (duda del
// revisor 2026-11-15). Se excluye de este run hasta verificación adicional.
const EXCLUDED_AFTER_REVIEW: Record<string, string> = {
  'revenue-faq': 'excluido[revision-historico]: cierra numericamente pero la serie empieza ~1 año tras el alta; pendiente verificación adicional',
}
// portfolioId real capturado del origen (PORTFOLIO_TIP_CACHED /results,
// evidencia captures/2026-11-15-tle-results-page1-state.json). El resto:
// id interno por secuencia (0005). Nunca un id de fixture.
const SOURCE_PORTFOLIO_IDS: Record<string, number> = { 'the-least-expected': 221629 }

// camelCase TipsterInsert -> columna SQL: COMPARTIDO en
// crawler/platforms/tipstrr/insert-sql.ts (mismo builder probado que el
// import de catálogo). updatedAt se omite: default NOW().
import { COLUMNS, buildInsert as buildInsertShared, buildUpdate as buildUpdateShared, camelize } from '../crawler/platforms/tipstrr/insert-sql'
export { COLUMNS }

// Pertenencia free/premium medida en la pasada de catálogo (combos).
const catalog = JSON.parse(
  readFileSync('crawler/platforms/tipstrr/captures/2026-11-15-catalog-selection.json', 'utf8')
) as { combos: Record<string, { pages: { slugs: string[] }[] }> }
const premium = new Set<string>()
for (const [k, c] of Object.entries(catalog.combos)) {
  for (const p of c.pages) for (const s of p.slugs) if (k.endsWith(':premium')) premium.add(s)
}



export const buildInsert = buildInsertShared
export const buildUpdate = buildUpdateShared

const skipClass = (reason: string): string => {
  const m = reason.match(/cuarentena\[([^\]]+)\]/)
  if (m) return `cuarentena[${m[1]}]`
  if (reason.includes('no más reciente')) return 'skip[captura-no-mas-reciente]'
  if (reason.includes('sin capturedAt')) return 'skip[capturedAt-ausente-o-invalido]'
  return 'skip[otro]'
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url || url.includes('localhost') || url.includes('dummy')) {
    throw new Error('DATABASE_URL ausente o dummy: el import real exige la cadena de producción')
  }
  const sql = neon(url)

  // Precondiciones de esquema (0004 + 0005 aplicados).
  const cols = await sql.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'tipsters' AND column_name IN ('platform', 'source_portfolio_id')`
  ) as { column_name: string }[]
  if (cols.length !== 2) throw new Error('faltan columnas platform/source_portfolio_id: aplica 0004 y 0005 antes del import')
  const seq = await sql.query(`SELECT 1 FROM pg_sequences WHERE sequencename = 'tipsters_internal_id_seq'`)
  if (seq.length === 0) throw new Error('falta tipsters_internal_id_seq: aplica 0005 antes del import')
  const logt = await sql.query(`SELECT 1 FROM pg_tables WHERE tablename = 'import_validation_log'`)
  if (logt.length === 0) throw new Error('falta import_validation_log: aplica 0005 antes del import')

  const pre = await sql.query(`SELECT count(*)::text AS n FROM tipsters`) as { n: string }[]
  console.log(`filas tipsters antes: ${pre[0].n} (deben quedar +N solo por inserts Tipstrr)`)

  const files = [...readdirSync(CAP_DIR).map((f) => join(CAP_DIR, f)), TLE_CAPTURE]
  const summary = { insert: 0, update: 0, skip: 0, quarantine: 0, errors: 0 }
  const skipDetail: { slug: string; klass: string }[] = []

  for (const f of files) {
    const cap = JSON.parse(readFileSync(f, 'utf8')) as TipstrrStatsCapture & {
      _meta: { source: string; captured: string; serverDate?: string }
    }
    const capturedIso = [cap._meta.captured, cap._meta.serverDate ?? ''].find(
      (x) => x && !Number.isNaN(new Date(x).getTime())
    )
    if (!capturedIso) throw new Error(`captura sin instante parseable: ${f}`)
    const slug = f.includes('tle-stats-state')
      ? 'the-least-expected'
      : f.split('/').pop()!.replace(/\.json$/, '')
    const excluded = EXCLUDED_AFTER_REVIEW[slug]
    if (excluded) {
      summary.skip++
      skipDetail.push({ slug, klass: 'excluido[revision-historico]' })
      if (APPLY) {
        await sql.transaction((txn) => [
          txn.query(
            `INSERT INTO import_validation_log (platform, slug, captured_at, class, reason, run_id) VALUES ($1, $2, $3, $4, $5, $6)`,
            ['tipstrr', slug, capturedIso, 'excluido[revision-historico]', excluded, RUN_ID]
          ),
        ])
      }
      continue
    }
    let snap = loadTipstrrCapture(cap, {
      sourceUrl: cap._meta.source.split(' ')[0],
      capturedAt: cap._meta.captured,
      capturedAtDate: capturedIso,
      editorial: {
        platformLabel: premium.has(slug) ? 'Premium (código type=2)' : 'Free (código type=1)',
        stakeLabel: null,
        roiPeriodLabel: 'código period del estado embebido (3/4/5 rodante, 6 all-time)',
        lastResultVisibleLabel: null,
        yieldEquivalenceNote: 'ROI Tipstrr = profit/staked; verificación por niveles en to-db.ts',
        notAvailable: [
          { field: 'subscriptionPriceGbp', reason: 'no presente en el estado /stats (membershipTier null)' },
          { field: 'lastPickAt', reason: 'dateAdded por tip solo en el detalle /results, fuera de esta fase' },
        ],
      },
    })
    if (sport6Slugs.has(slug)) {
      const sp6 = JSON.parse(readFileSync(join(SPORT6_DIR, `${slug}.json`), 'utf8')) as Sport6Capture
      snap = applySport6AllTime(snap, sport6Totals(sp6), SPORT6_LABEL)
    }
    const portfolioId = SOURCE_PORTFOLIO_IDS[slug]
    const idSource: TipstrrIdSource = portfolioId ? 'source-captured' : 'internal-transactional'
    const mapping = tipstrrSnapshotToInsert(snap, {
      // Con id interno el valor real lo asigna la secuencia en el INSERT;
      // este placeholder no llega a la base (buildInsert lo sustituye por
      // nextval en la misma transacción).
      id: portfolioId ? -portfolioId : -1,
      idSource,
      slug,
      subscriptionPriceGbp: null,
      isPaid: premium.has(slug),
    })
    if (mapping.ok && portfolioId) mapping.insert.sourcePortfolioId = portfolioId

    // Guarda de proveniencia ANTES de cualquier write (función con caller
    // real desde esta ruta; sigue lanzando sobre fixtures).
    assertRealImportProvenance(idSource, slug)

    const existingRows = (await sql.query(
      `SELECT * FROM tipsters WHERE platform = 'tipstrr' AND slug = $1`, [slug]
    )) as Record<string, unknown>[]
    const existing = existingRows.length > 0 ? (camelize(existingRows[0]) as TipsterInsert) : null
    // Lote sport/6: SOLO ALTAS (decisión de revisión 2026-11-15). Una fila
    // existente se preserva intacta y se salta siempre; no depende de que la
    // captura sea "no más reciente".
    const plan = planSport6Batch(existing, mapping)

    if (plan.action === 'skip-existing') {
      summary.skip++
      skipDetail.push({ slug, klass: 'skip[existente-preservado]' })
      if (APPLY) {
        await sql.transaction((txn) => [
          txn.query(
            `INSERT INTO import_validation_log (platform, slug, captured_at, class, reason, run_id) VALUES ($1, $2, $3, $4, $5, $6)`,
            ['tipstrr', slug, capturedIso, 'skip[existente-preservado]', 'lote sport/6 solo-altas: la fila existente se preserva intacta, sin update', RUN_ID]
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
    // Solo queda 'insert' (lote solo-altas). Insert + log de procedencia
    // sport/6 en UNA transacción: una caída no puede dejar la fila sin su
    // fuente, y un reintento la verá existente y la saltará con el log ya
    // escrito (o nada escrito en absoluto).
    if (!APPLY) {
      summary.insert++
      continue
    }
    const q = buildInsert(plan.insert, !portfolioId)
    await sql.transaction((txn) => {
      const batch = [txn.query(q.text, q.params)]
      if (sport6Slugs.has(slug)) {
        batch.push(
          txn.query(
            `INSERT INTO import_validation_log (platform, slug, captured_at, class, reason, run_id) VALUES ($1, $2, $3, $4, $5, $6)`,
            ['tipstrr', slug, capturedIso, 'importado[sport6-override]',
             'overview all-time sustituido por totales advised de /api/portfolio/<slug>/stats/sport/6 (captura 2026-11-15); cierre de 3 cifras re-verificado por la puerta contra la serie mensual embebida',
             RUN_ID]
          )
        )
      }
      return batch
    })
    summary.insert++
  }

  console.log(JSON.stringify({ runId: RUN_ID, apply: APPLY, summary, skipDetail }, null, 1))

  if (APPLY) {
    // Verificación post-import: conteos por plataforma y ausencia de ids de
    // fixture (rango aislado -900000-i) en tipsters.
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

// Importing SQL builders in tests must never run a production importer.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
