// Ingesta por lotes de las capturas /stats del catálogo Tipstrr (209
// perfiles, 2026-11-15) en una base AISLADA (PGlite local). Nunca Neon.
// Aplica el journal completo (0000→0004) y la puerta por niveles de
// to-db.ts; los rechazos se listan con motivo. Los ids Tipstrr son
// PROVISIONALES (secuencia -900000-i) salvo TLE (-221629, portfolioId
// real capturado): el estado /stats no expone portfolioId y la convención
// prohíbe inventarlo para producción. Uso:
//   PGLITE_DIR=/tmp/pglite-catalog npx tsx scripts/seed-tipstrr-catalog.ts
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { tipsters } from '../db/schema'
import { loadTipstrrCapture, type TipstrrStatsCapture } from '../crawler/platforms/tipstrr/load-capture'
import { tipstrrSnapshotToInsert } from '../crawler/platforms/tipstrr/to-db'

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
const tiers: Record<string, number> = {}
const nullReasons: Record<string, number> = {}

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
  i++
  const m = tipstrrSnapshotToInsert(snap, {
    id,
    slug,
    subscriptionPriceGbp: null,
    isPaid: premium.has(slug), // free y premium son disjuntos en la pasada (solape 0)
  })
  if (!m.ok) {
    rejected.push({ slug, reason: m.reason })
    continue
  }
  // Nivel de la puerta (misma lógica de ramas que to-db.ts, para auditoría):
  const sumTipsT = snap.monthState.reduce((a, r) => a + r.tips, 0)
  const overviewAllTimeT =
    snap.overviewPeriod === 6 || (snap.overview.tips !== null && snap.overview.tips === sumTipsT)
  const allConsistentT = snap.consistency.length > 0 && snap.consistency.every((c) => c.passed)
  const verifiedT =
    overviewAllTimeT && allConsistentT && (snap.monthState.length === 0 || snap.overview.tips === sumTipsT)
  const tier = verifiedT ? 'VERIFICADO' : overviewAllTimeT ? 'CONTRADICCION' : 'COBERTURA'
  tiers[tier] = (tiers[tier] ?? 0) + 1
  if (m.insert.yield === null) {
    const why = verifiedT
      ? 'verificado_sin_roi'
      : overviewAllTimeT
        ? 'contradiccion_overview_vs_serie'
        : 'cobertura_sin_denominador'
    nullReasons[why] = (nullReasons[why] ?? 0) + 1
  }
  await db.insert(tipsters).values(m.insert)
  okRows.push({ slug, picks: m.insert.picks!, yield: m.insert.yield ?? null, paid: m.insert.isPaid! })
}

const byPlatform = await pg.query<{ platform: string; n: string }>(
  `SELECT platform, count(*)::text AS n FROM tipsters GROUP BY platform`
)
console.log(JSON.stringify({
  persisted: okRows.length,
  rejected: rejected.length,
  rejectedDetail: rejected,
  tiers,
  nullReasons,
  withYield: okRows.filter((r) => r.yield !== null).length,
  yieldNull: okRows.filter((r) => r.yield === null).length,
  byPlatform,
  picksTotal: okRows.reduce((a, r) => a + r.picks, 0),
}, null, 1))
await pg.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
