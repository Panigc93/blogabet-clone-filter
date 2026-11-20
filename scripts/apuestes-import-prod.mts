// Import REAL Apuestes -> Neon producción (Superblogabet). PREPARADO, no
// ejecutado: requiere mensaje ORIGINAL del usuario autorizando la carga.
// Dry-run por defecto; --apply escribe.
//
// Precondiciones verificadas al arrancar (falla ruidoso si falta):
//   0006 aplicado (tipsters.source_url), 0 filas platform='apuestes',
//   dataset local presente (data/apuestes, gitignored, nunca commiteado).
//
// Toda la carga va en UNA transacción (batch HTTP de Neon vía drizzle):
// si algo falla, no queda nada a medias. Los holds se registran en
// import_validation_log con el run_id EXACTO de esta ejecución.
//
// Reversión acotada (igualdad exacta, NO LIKE: un patrón general podría
// alcanzar corridas futuras de la misma plataforma):
//   DELETE FROM tipsters WHERE platform='apuestes';
//   DELETE FROM import_validation_log WHERE run_id = 'apuestes-prod-2026-11-20';
//   (opcional) ALTER TABLE tipsters DROP COLUMN source_url;  -- aditiva, puede quedarse
// La secuencia tipsters_internal_id_seq no se revierte: los ids son
// subrogados y los huecos son inocuos.
//
// Uso:
//   DATABASE_URL=<cadena> npx tsx scripts/apuestes-import-prod.mts           # dry-run
//   DATABASE_URL=<cadena> npx tsx scripts/apuestes-import-prod.mts --apply   # aplica
//
// La cadena se lee de la variable de entorno; nunca se imprime.
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { tipsters, importValidationLog } from '../db/schema'
import { planApuestesImport, executeApuestesImport } from '../crawler/platforms/apuestes/import'

export const RUN_ID = 'apuestes-prod-2026-11-20'
const JSONL = new URL('../data/apuestes/profiles.jsonl', import.meta.url).pathname
const URLS = new URL('../data/apuestes/profile-urls.json', import.meta.url).pathname
const APPLY = process.argv.includes('--apply')

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL requerida (variable de entorno; nunca imprimir)')
  const sql = neon(url)

  // Precondición 1: 0006 aplicada.
  const col = await sql(`SELECT count(*)::int AS n FROM information_schema.columns
                         WHERE table_name='tipsters' AND column_name='source_url'`)
  if ((col[0] as any).n !== 1) throw new Error('Falta tipsters.source_url: aplica drizzle/0006 primero')

  // Precondición 2: plataforma vacía (primera carga; si no, abortar y revisar).
  const pre = await sql(`SELECT count(*)::int AS n FROM tipsters WHERE platform='apuestes'`)
  if ((pre[0] as any).n !== 0) throw new Error(`platform='apuestes' ya tiene ${(pre[0] as any).n} filas; abortando`)

  // Huella previa de otras plataformas (para el chequeo post-carga).
  const before = await sql(`SELECT platform, count(*)::int AS n FROM tipsters GROUP BY platform ORDER BY platform`)

  const plan = planApuestesImport(JSONL, URLS)
  console.log(`plan: ${plan.rows} filas -> ${plan.inserts.length} inserts + ${plan.holds.length} holds | run_id=${RUN_ID}`)
  if (!APPLY) { console.log('dry-run: sin escrituras. --apply para ejecutar.'); return }

  const db = drizzle(sql, { schema: { tipsters, importValidationLog } })
  const out = await executeApuestesImport(db, plan, RUN_ID)

  // Chequeo post-carga (misma conexión).
  const afterAp = await sql(`SELECT count(*)::int AS n, count(source_url)::int AS urls FROM tipsters WHERE platform='apuestes'`)
  const holds = await sql(`SELECT count(*)::int AS n FROM import_validation_log WHERE run_id = ${RUN_ID}`)
  const after = await sql(`SELECT platform, count(*)::int AS n FROM tipsters GROUP BY platform ORDER BY platform`)
  const intact = before.every((b: any) => b.platform === 'apuestes' ||
    (after as any[]).some((a: any) => a.platform === b.platform && a.n === b.n))
  console.log(`apuestes: ${(afterAp[0] as any).n} filas (${(afterAp[0] as any).urls} con source_url, ${(afterAp[0] as any).n - (afterAp[0] as any).urls} sin URL)`)
  console.log(`holds registrados (${RUN_ID}): ${(holds[0] as any).n} | upserted=${out.upserted} holdsLogged=${out.holdsLogged}`)
  console.log(`otras plataformas intactas: ${intact ? 'OK' : 'FALLO — revisar'}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
