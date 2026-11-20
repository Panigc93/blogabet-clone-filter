import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TipsterRow } from '@/components/TipsterRow'
import { fromDbTipster } from '@/components/tipster-card-model'
import { profitSortWarning } from '@/lib/query'
import { golazobetsCaptureToInsert, type GzbProfileCapture } from '@/crawler/platforms/golazobets/to-db'
import type { Tipster } from '@/db/schema'

// Lab · vista combinada "Todas" con sort=profit (FIXTURE, sin base de datos).
// Proposito: verificacion visual del aviso de unidades no comparables y de la
// ordenacion agrupada por unidad ANTES de cualquier apply. El orden de las
// filas replica la semantica real de sortOrder('profit') en lib/query.ts
// (profit_unit ASC, profit DESC), verificada a nivel SQL en
// tests/db/multi-platform.integration.test.ts. Filas: BB sintetica,
// Golazobets desde captura real 2026-11-15, Tipstrr sinteticas.

const CAP_DIR = join(process.cwd(), 'crawler/platforms/golazobets/captures/2026-11-15-profiles')

// FABRICATED rows (BB y Tipstrr): solo importa la forma; cifras inventadas.
const BASE = {
  signupAt: null,
  capturedAt: null,
  avatarUrl: null,
  flagUrl: null,
  countryCode: null,
  verifiedPct: null,
  lastPickAt: null,
  resetCount: 0,
  lastResetAt: null,
  updatedAt: new Date('2026-11-16T00:00:00Z'),
  picks6mAvg: null,
  yield3m: null,
  yield6m: null,
  yield12m: null,
  picksFree3mAvg: null,
  yieldFree3m: null,
  statsUpdatedAt: null,
  sourcePortfolioId: null, sourceUrl: null,
}

const BB: Tipster = {
  ...BASE,
  id: 1, platform: 'blogabet', slug: 'demo-bb', name: 'Demo BB (€)',
  profitUnit: 'eur', priceCurrency: 'eur', isPaid: true, price: '40.00',
  sinceYear: 2019, picks: 900, profit: '1200.00', yield: '9.50',
  isVerified: true, followers: 150,
}

const GZB_CAP = JSON.parse(readFileSync(join(CAP_DIR, 'FutbolEnCasa.json'), 'utf8')) as GzbProfileCapture
const gzbMap = golazobetsCaptureToInsert('FutbolEnCasa', GZB_CAP, { capturedAt: '2026-11-15T00:00:00.000Z' })
if (!gzbMap.ok) throw new Error(gzbMap.reason)
const GZB: Tipster = { ...gzbMap.insert, id: 2, updatedAt: new Date('2026-11-16T00:00:00Z') } as Tipster

const TT1: Tipster = {
  ...BASE,
  id: 3, platform: 'tipstrr', slug: 'demo-tt-alto', name: 'Demo Tipstrr alto (u)',
  profitUnit: 'units', priceCurrency: 'gbp', isPaid: true, price: '39.00',
  sinceYear: null, picks: 1974, profit: '361.815', yield: '18.33',
  isVerified: false, followers: null, capturedAt: new Date('2026-11-15T00:00:00Z'),
}

const TT2: Tipster = {
  ...BASE,
  id: 4, platform: 'tipstrr', slug: 'demo-tt-bajo', name: 'Demo Tipstrr bajo (u)',
  profitUnit: 'units', priceCurrency: 'gbp', isPaid: false, price: null,
  sinceYear: null, picks: 291, profit: '-58.20', yield: '-4.10',
  isVerified: false, followers: null, capturedAt: new Date('2026-11-15T00:00:00Z'),
}

// Orden real de sortOrder('profit'): profit_unit ASC ('eur' < 'golazobets-units'
// < 'units') y dentro de cada unidad profit DESC NULLS LAST.
const ORDERED: Tipster[] = [BB, GZB, TT1, TT2]
const aviso = profitSortWarning('profit', undefined)

export default function LabTodasProfitPage() {
  return (
    <div id="page-content" style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 12px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Lab · vista combinada, orden por beneficio (fixture)</h1>
      <p style={{ fontSize: 13, color: '#555', maxWidth: 760 }}>
        Demuestra el aviso y la ordenacion agrupada por unidad. Ojo: Golazobets (+1,57 ud)
        aparece ANTES que Tipstrr (+361,815 u) aunque el numero sea menor: son unidades
        distintas y no se mezclan en un mismo ranking.
      </p>
      {aviso && (
        <div style={{ margin: '8px 0 12px', padding: '8px 12px', background: '#fcf8e3', border: '1px solid #faebcc', borderRadius: 4, fontSize: 13, color: '#8a6d3b' }}>
          {aviso}
        </div>
      )}
      {ORDERED.map((t) => (
        <div key={t.id} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>
            grupo unidad: {t.profitUnit}
          </div>
          <TipsterRow tipster={fromDbTipster(t)} />
        </div>
      ))}
    </div>
  )
}
