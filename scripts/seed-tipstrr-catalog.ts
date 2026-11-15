// Ingesta por lotes de las capturas /stats del catálogo Tipstrr (209
// perfiles, 2026-11-15) en una base AISLADA (PGlite local). Nunca Neon.
// Aplica el journal completo (0000→0004) y la puerta por niveles de
// to-db.ts; los rechazos se listan con motivo. Los ids Tipstrr son
// PROVISIONALES (secuencia -900000-i) salvo TLE (-221629, portfolioId
// real capturado): el estado /stats no expone portfolioId y la convención
// prohíbe inventarlo para producción. Uso:
//   PGLITE_DIR=/tmp/pglite-catalog npx tsx scripts/seed-tipstrr-catalog.ts
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { tipsters } from '../db/schema'
import { loadTipstrrCapture, type TipstrrStatsCapture } from '../crawler/platforms/tipstrr/load-capture'
import { tipstrrSnapshotToInsert, planTipstrrUpsert } from '../crawler/platforms/tipstrr/to-db'

const DIR = process.env.PGLITE_DIR || '/tmp/pglite-catalog'
const CAP_DIR = 'crawler/platforms/tipstrr/captures/2026-11-15-stats'
const MIGRATIONS = [
  '0000_sudden_jazinda.sql',
  '0001_add_last_reset_at.sql',
  '0002_add_is_verified.sql',
  '0003_naive_dormammu.sql',
  '0004_multi_platform.sql',
]

// Pertenencia free/premium medida en la pasada de catálogo (combos).
const catalog = JSON.parse(
  readFileSync('crawler/platforms/tipstrr/captures/2026-11-15-catalog-selection.json', 'utf8')
) as { combos: Record<string, { pages: { slugs: string[] }[] }> }
const premium = new Set<string>()
const free = new Set<string>()
for (const [k, c] of Object.entries(catalog.combos)) {
  for (const p of c.pages) for (const s of p.slugs) (k.endsWith(':premium') ? premium : free).add(s)
}

async function main() {
rmSync(DIR, { recursive: true, force: true })
const pg = new PGlite(DIR)
for (const m of MIGRATIONS) {
  await pg.exec(readFileSync(join('drizzle', m), 'utf8'))
}
const db = drizzle(pg)

const files = [
  ...readdirSync(CAP_DIR).map((f) => join(CAP_DIR, f)),
  'crawler/platforms/tipstrr/captures/2026-11-15-tle-stats-state.json',
]
const quarantineClasses: Record<string, number> = {}
const persistedClasses: Record<string, number> = {}

let i = 0
const okRows: { slug: string; picks: number; yield: string | null; paid: boolean }[] = []
const rejected: { slug: string; reason: string }[] = []
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
  const snap = loadTipstrrCapture(cap, {
    sourceUrl: cap._meta.source.split(' ')[0],
    capturedAt: cap._meta.captured,
    capturedAtDate: capturedIso,
    editorial: {
      // Etiqueta derivada del código type del estado (1/2), no verbatim de página.
      platformLabel: premium.has(slug) ? 'Premium (código type=2)' : 'Free (código type=1)',
      stakeLabel: null,
      roiPeriodLabel: 'código period del estado embebido (3/4/5 rodante, 6 all-time)',
      lastResultVisibleLabel: null,
      yieldEquivalenceNote: 'ROI Tipstrr = profit/staked; verificación por niveles en to-db.ts',
      notAvailable: [
        { field: 'subscriptionPriceGbp', reason: 'no presente en el estado /stats (membershipTier null); solo visible en tarjetas del listado, no capturadas' },
        { field: 'lastPickAt', reason: 'dateAdded por tip solo en el detalle /results, fuera de esta fase' },
      ],
    },
  })
  const id = slug === 'the-least-expected' ? -221629 : -900000 - i
  const idSource =
    slug === 'the-least-expected' ? 'source-captured' as const : 'isolated-fixture' as const
  i++
  const m = tipstrrSnapshotToInsert(snap, {
    id,
    idSource,
    slug,
    subscriptionPriceGbp: null,
    isPaid: premium.has(slug), // free y premium son disjuntos en la pasada (solape 0)
  })
  if (!m.ok) {
    const cls = (m.reason.match(/cuarentena\[([^\]]+)\]/) ?? [null, 'sin-clase'])[1]
    quarantineClasses[cls!] = (quarantineClasses[cls!] ?? 0) + 1
    rejected.push({ slug, reason: m.reason })
    continue
  }
  // Clase de persistencia para auditoría (la decisión real vive en to-db.ts):
  const cls = m.insert.picks === 0 ? 'cero-real' : 'cierre-alltime-independiente'
  persistedClasses[cls] = (persistedClasses[cls] ?? 0) + 1
  // Upsert por planTipstrrUpsert: preserva ausentes, no retrocede con
  // capturas antiguas y una cuarentena nunca toca la fila guardada.
  const existing = await pg.query<{ id: number }>(
    `SELECT id FROM tipsters WHERE platform = 'tipstrr' AND slug = $1`, [slug]
  )
  let existingRow: Record<string, unknown> | null = null
  if (existing.rows.length > 0) {
    const cur = await pg.query('SELECT * FROM tipsters WHERE id = $1', [existing.rows[0].id])
    const row = cur.rows[0] as Record<string, unknown>
    const camel: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(row)) {
      camel[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = v
    }
    existingRow = camel
  }
  const plan = planTipstrrUpsert(existingRow as never, m)
  if (plan.action === 'update') {
    const merged = plan.merged
    await pg.query(
      `UPDATE tipsters SET picks = $2, profit = $3, yield = $4, price = $5, captured_at = $6,
         stats_updated_at = $7, yield3m = $8, yield6m = $9, yield12m = $10, picks6m_avg = $11
       WHERE id = $1`,
      [existing.rows[0].id, merged.picks, merged.profit, merged.yield, merged.price,
       merged.capturedAt, merged.statsUpdatedAt, merged.yield3m, merged.yield6m,
       merged.yield12m, merged.picks6mAvg]
    )
  } else if (plan.action === 'insert') {
    await db.insert(tipsters).values(plan.insert)
  }
  // plan.action === 'skip': nada que escribir (captura no más reciente).
  // TipsterInsert marca los campos opcionales (tipo de inserción parcial);
  // la puerta garantiza picks e isPaid — se estrecha con guarda explícita,
  // no con aserción.
  const { picks: mappedPicks, isPaid: mappedPaid, yield: mappedYield } = m.insert
  if (mappedPicks === undefined || mappedPaid === undefined) {
    throw new Error(`seed: mapeo sin picks/isPaid para ${slug} (no debería ocurrir tras la puerta)`)
  }
  okRows.push({ slug, picks: mappedPicks, yield: mappedYield ?? null, paid: mappedPaid })
}

// Registro de validaciones fallidas FUERA de la fila: una cuarentena no
// toca la fila guardada, así que sin este artefacto un yield antiguo
// parecería re-confirmado por la última captura. El log deja constancia
// por slug del motivo de la última validación fallida. Diseño para la ruta
// real: tabla import_validation_log (platform, slug, captured_at, clase,
// motivo) escrita en la misma transacción del plan — ver
// docs/multi-platform-db.md. Es un REGISTRO, no oculta datos.
writeFileSync(
  'crawler/platforms/tipstrr/captures/2026-11-15-quarantine-log.json',
  JSON.stringify({
    _meta: {
      purpose: 'motivo de la última validación fallida por slug, fuera de la fila persistida',
      run: 'seed-tipstrr-catalog (aislado PGlite)',
      captured: '2026-11-15',
    },
    rejected: rejected.length,
    quarantineClasses,
    detail: rejected,
  }, null, 1)
)

const byPlatform = await pg.query<{ platform: string; n: string }>(
  `SELECT platform, count(*)::text AS n FROM tipsters GROUP BY platform`
)
console.log(JSON.stringify({
  persisted: okRows.length,
  rejected: rejected.length,
  rejectedDetail: rejected,
  persistedClasses,
  quarantineClasses,
  withYield: okRows.filter((r) => r.yield !== null).length,
  yieldNull: okRows.filter((r) => r.yield === null).length,
  byPlatform,
  picksTotal: okRows.reduce((a, r) => a + r.picks, 0),
}, null, 1))
await pg.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
