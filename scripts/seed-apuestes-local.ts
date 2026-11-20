// Siembra la captura REAL de Apuestes en una base AISLADA en proceso (PGlite,
// disco local) mediante la ruta de import real (crawler/platforms/apuestes/
// import.ts), y la ejecuta DOS veces para demostrar idempotencia: el estado de
// tipsters tras la segunda pasada debe ser idéntico (misma captura -> mismas
// filas; import_validation_log crece una entrada por hold y pasada, por diseño).
// Uso: PGLITE_DIR=/tmp/pglite-apuestes npx tsx scripts/seed-apuestes-local.ts
// La app se sirve después con USE_PGLITE=1 y el mismo PGLITE_DIR.
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { tipsters, importValidationLog } from '../db/schema'
import { planApuestesImport, executeApuestesImport } from '../crawler/platforms/apuestes/import'

const DIR = process.env.PGLITE_DIR || '/tmp/pglite-apuestes'
const JSONL = new URL('../data/apuestes/profiles.jsonl', import.meta.url).pathname
const URLS = new URL('../data/apuestes/profile-urls.json', import.meta.url).pathname

const MIGRATIONS = [
  '0000_sudden_jazinda.sql',
  '0001_add_last_reset_at.sql',
  '0002_add_is_verified.sql',
  '0003_naive_dormammu.sql',
  '0004_multi_platform.sql',
  '0005_tipstrr_internal_pk.sql',
  '0006_apuestes_source_url.sql', // draft local, no aplicada en remoto
]

async function checksum(pg: PGlite): Promise<string> {
  const r = await pg.query<{ n: string; picks: string; urls: string; at: string }>(
    `SELECT count(*)::text AS n, COALESCE(sum(picks),0)::text AS picks,
            count(source_url)::text AS urls,
            count(*) FILTER (WHERE name LIKE '%@%' OR slug LIKE '%@%' OR source_url LIKE '%@%@%' )::text AS at
     FROM tipsters WHERE platform='apuestes'`
  )
  const row = r.rows[0]
  return `rows=${row.n} sumPicks=${row.picks} conSourceUrl=${row.urls} flagsAt=${row.at}`
}

async function main() {
  rmSync(DIR, { recursive: true, force: true })
  const pg = new PGlite(DIR)
  const db = drizzle(pg, { schema: { tipsters, importValidationLog } })

  for (const file of MIGRATIONS) {
    const sqlText = readFileSync(join(__dirname, '../drizzle', file), 'utf8')
    for (const stmt of sqlText.split('--> statement-breakpoint')) {
      const s = stmt.trim()
      if (s) await pg.exec(s)
    }
  }

  const plan = planApuestesImport(JSONL, URLS)
  console.log(`plan: ${plan.rows} filas -> ${plan.inserts.length} inserts + ${plan.holds.length} holds`)

  const run1 = await executeApuestesImport(db, plan, 'apuestes-local-run1')
  const after1 = await checksum(pg)
  const run2 = await executeApuestesImport(db, plan, 'apuestes-local-run2')
  const after2 = await checksum(pg)

  const holdsLog = await pg.query<{ n: string }>('SELECT count(*)::text AS n FROM import_validation_log')
  console.log(`pasada1: upserted=${run1.upserted} | ${after1}`)
  console.log(`pasada2: upserted=${run2.upserted} | ${after2}`)
  console.log(`IDEMPOTENCIA: ${after1 === after2 ? 'OK (estado idéntico tras repetir)' : 'FALLO: el estado cambió'}`)
  console.log(`holds en import_validation_log: ${holdsLog.rows[0].n} (2 pasadas x ${plan.holds.length})`)
  await pg.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
