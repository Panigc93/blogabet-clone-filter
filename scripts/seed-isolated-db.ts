// Siembra una base AISLADA en proceso (PGlite, disco local) para validar la
// integración multifuente con la app real (home, filtros, LoadMore) sin
// tocar Neon. Uso: PGLITE_DIR=/tmp/pglite-data npx tsx scripts/seed-isolated-db.ts
// La app se sirve después con USE_PGLITE=1 apuntando al mismo directorio.
//
// Aplica la cadena COMPLETA del journal real (0000→0004): el baseline de
// PR1 (0003_naive_dormammu, ya registrado en producción) + nuestro delta
// 0004 generado por drizzle-kit. Sin parches fuera de migración.
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { tipsters } from '../db/schema'
import { tipstrrSnapshotToInsert } from '../crawler/platforms/tipstrr/to-db'
import { TLE_SNAPSHOT, STATMIND_SNAPSHOT } from '../app/lab/tipstrr/ficha/fixtures'

const DIR = process.env.PGLITE_DIR || '/tmp/pglite-data'

const MIGRATIONS = [
  '0000_sudden_jazinda.sql',
  '0001_add_last_reset_at.sql',
  '0002_add_is_verified.sql',
  '0003_naive_dormammu.sql',
  '0004_multi_platform.sql',
]

// Filas Blogabet FABRICADAS (cifras inventadas, nombres "BB Demo") solo para
// ejercitar tabla, filtros, orden y LoadMore (PAGE_SIZE=50) en local.
function bbDemoRow(i: number) {
  const paid = i % 3 !== 0 // mezcla free/pago para probar el filtro tipo
  return {
    id: 1000 + i,
    platform: 'blogabet',
    slug: `bb-demo-${String(i).padStart(3, '0')}`,
    name: `BB Demo ${String(i).padStart(2, '0')}`,
    avatarUrl: null,
    flagUrl: null,
    countryCode: null,
    isPaid: paid,
    price: paid ? (10 + (i % 5) * 10).toFixed(2) : null,
    priceCurrency: 'eur',
    profitUnit: 'eur',
    sinceYear: 2016 + (i % 9),
    picks: 100 + i * 17,
    profit: (i * 42.5 - 500).toFixed(2),
    yield: ((i % 25) - 5 + 0.37).toFixed(2),
    verifiedPct: i % 4 === 0 ? null : (90 + (i % 9)).toFixed(2),
    isVerified: i % 4 !== 0,
    followers: 20 + i * 3,
    lastPickAt: new Date(Date.UTC(2026, 10, 1 + (i % 14))),
    signupAt: null,
    capturedAt: null,
    resetCount: i % 7 === 0 ? 1 : 0,
    lastResetAt: i % 7 === 0 ? new Date(Date.UTC(2026, 5, 10)) : null,
    picks6mAvg: (5 + (i % 20)).toFixed(2),
    yield3m: ((i % 15) - 4 + 0.11).toFixed(2),
    yield6m: ((i % 18) - 5 + 0.22).toFixed(2),
    yield12m: ((i % 20) - 6 + 0.33).toFixed(2),
    picksFree3mAvg: paid ? (i % 6).toFixed(2) : null,
    yieldFree3m: paid ? ((i % 9) - 2 + 0.5).toFixed(2) : null,
    statsUpdatedAt: new Date(Date.UTC(2026, 10, 15)),
  }
}

async function main() {
  rmSync(DIR, { recursive: true, force: true })
  const pg = new PGlite(DIR)
  const db = drizzle(pg, { schema: { tipsters } })

  for (const file of MIGRATIONS) {
    const sqlText = readFileSync(join(__dirname, '../drizzle', file), 'utf8')
    for (const stmt of sqlText.split('--> statement-breakpoint')) {
      const s = stmt.trim()
      if (s) await pg.exec(s)
    }
  }

  const bbRows = Array.from({ length: 56 }, (_, i) => bbDemoRow(i + 1))
  await db.insert(tipsters).values(bbRows)
  // Colisión de slug deliberada con TLE: misma slug, plataforma distinta.
  await db.insert(tipsters).values({
    ...bbDemoRow(90),
    id: 101,
    slug: 'the-least-expected',
    name: 'BB Demo Same Slug',
  })
  // Filas Tipstrr desde las capturas reales fechadas del repo.
  await db.insert(tipsters).values([
    tipstrrSnapshotToInsert(TLE_SNAPSHOT, { id: -221629, slug: 'the-least-expected', subscriptionPriceGbp: 39, isPaid: true }),
    tipstrrSnapshotToInsert(STATMIND_SNAPSHOT, { id: -999999, slug: 'statmind', subscriptionPriceGbp: null, isPaid: false }),
  ])

  const n = await pg.query<{ n: string }>('SELECT count(*)::text AS n FROM tipsters')
  const byPlatform = await pg.query<{ platform: string; n: string }>(
    'SELECT platform, count(*)::text AS n FROM tipsters GROUP BY platform ORDER BY platform'
  )
  console.log(`sembradas ${n.rows[0].n} filas en ${DIR}`, byPlatform.rows)
  await pg.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
