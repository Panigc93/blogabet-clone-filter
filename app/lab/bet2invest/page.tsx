import { notFound } from 'next/navigation'
import { TipsterRow } from '@/components/TipsterRow'
import { fromDbTipster } from '@/components/tipster-card-model'
import {
  bet2investProfileToInsert,
  type Bet2InvestDbMapping,
} from '@/crawler/platforms/bet2invest/to-db'
import type { Bet2InvestProfile } from '@/crawler/platforms/bet2invest/parse'
import type { Tipster } from '@/db/schema'

// Vista previa VISUAL aislada de filas Bet2Invest con el pipeline real de
// tarjeta (perfil parseado -> bet2investProfileToInsert -> fromDbTipster ->
// TipsterRow). Datos FULLY SYNTHETIC (identidades y cifras inventadas): no
// hay fetch, ni capturas reales, ni base de datos. Esta página no está
// enlazada desde la app y además va GUARDADA: sin LAB_PREVIEW=1 en el
// entorno responde 404, así no puede exponerse por un despliegue
// accidental si la rama llegara a producción. Es solo previsualización de
// la UI antes de cualquier importación (pendiente de decisión del
// propietario).

const CAPTURED_AT = new Date('2026-11-16T10:00:00.000Z')

function syntheticProfile(overrides: Partial<Bet2InvestProfile>): Bet2InvestProfile {
  return {
    platform: 'bet2invest',
    username: 'SINTETICO',
    profileUrl: 'https://bet2invest.com/tipsters/performance-stats/SINTETICO',
    periodLabel: 'All',
    statsScope: 'all_time',
    accountType: 'pro',
    audience: { rating: 4.2, subscribers: 31, followers: 1200 },
    settledBets: 812,
    profitUnits: 37.42,
    roiPct: 6.31,
    avgOdds: 2.014,
    avgMaxBet: 2750,
    avgMaxBetCurrency: '€',
    clvPct: 1.38,
    results: { won: 360, halfWon: 31, refunded: 88, halfLost: 18, lost: 315 },
    bySport: [
      { label: 'Basketball', bets: 800, winRatePct: 52.25, profitUnits: 35.1, roiPct: 6.1, clvPct: 1.2, clevPct: -0.85, avgOdds: 2.02, avgMaxBet: 2400, avgMaxBetCurrency: '$' },
      { label: 'Ice hockey', bets: 12, winRatePct: 58.33, profitUnits: 2.32, roiPct: 24.1, clvPct: 3.05, clevPct: 0.1, avgOdds: 1.76, avgMaxBet: 150, avgMaxBetCurrency: '$' },
    ],
    monthlyAvailable: false,
    ...overrides,
  }
}

const SAMPLE: { slug: string; nota: string; profile: Bet2InvestProfile }[] = [
  {
    slug: 'PunterFicticio',
    nota: 'perfil all-time PRO con cierres exactos (caso persistible)',
    profile: syntheticProfile({ username: 'PunterFicticio' }),
  },
  {
    slug: 'RachaFicticia',
    nota: 'segundo perfil persistible, profit negativo',
    profile: syntheticProfile({
      username: 'RachaFicticia',
      audience: { rating: 3.1, subscribers: 4, followers: 86 },
      settledBets: 300,
      profitUnits: -12.05,
      roiPct: -4.2,
      results: { won: 120, halfWon: 5, refunded: 30, halfLost: 5, lost: 140 },
      bySport: [
        { label: 'Football', bets: 300, winRatePct: 41.67, profitUnits: -12.05, roiPct: -4.2, clvPct: -0.4, clevPct: 0.1, avgOdds: 2.1, avgMaxBet: 900, avgMaxBetCurrency: '€' },
      ],
    }),
  },
  {
    slug: 'NuevoFicticio',
    nota: 'caso cero-real: 0 bets con todo a 0 (persiste picks 0, yield null)',
    profile: syntheticProfile({
      username: 'NuevoFicticio',
      audience: { rating: null, subscribers: 0, followers: null },
      settledBets: 0,
      profitUnits: 0,
      roiPct: 0,
      results: { won: 0, halfWon: 0, refunded: 0, halfLost: 0, lost: 0 },
      bySport: [],
    }),
  },
  {
    slug: 'SinTipoFicticio',
    nota: 'CUARENTENA: accountType unknown (la ausencia de marca PRO no prueba free)',
    profile: syntheticProfile({ username: 'SinTipoFicticio', accountType: 'unknown' }),
  },
  {
    slug: 'PeriodoFicticio',
    nota: "CUARENTENA: periodo activo '3 months' (solo persiste 'All')",
    profile: syntheticProfile({ username: 'PeriodoFicticio', statsScope: 'other_period', periodLabel: '3 months' }),
  },
]

export default function LabBet2InvestPage() {
  // Guarda real de aislamiento: la ruta no existe fuera de un entorno que
  // pida explícitamente la preview (LAB_PREVIEW=1). 'No enlazada' no es
  // suficiente: una ruta desplegada es pública aunque nadie enlace a ella.
  if (process.env.LAB_PREVIEW !== '1') notFound()
  const rows = SAMPLE.map(({ slug, nota, profile }, i) => {
    const mapping: Bet2InvestDbMapping = bet2investProfileToInsert(profile, {
      id: -920000 - i, // fixture aislado: nunca payload de producción
      idSource: 'isolated-fixture',
      slug,
      capturedAt: CAPTURED_AT,
    })
    if (!mapping.ok) return { slug, nota, error: mapping.reason, card: null }
    const t = { ...mapping.insert, updatedAt: CAPTURED_AT } as Tipster
    return { slug, nota, error: null, card: fromDbTipster(t) }
  })

  return (
    <div id="page-content" style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 12px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Lab · vista previa Bet2Invest</h1>
      <p style={{ fontSize: 13, color: '#555', maxWidth: 760 }}>
        Filas renderizadas con el pipeline real desde perfiles <strong>sintéticos</strong> (no hay
        fetch ni capturas reales). El beneficio se etiqueta como <strong>u (Bet2Invest)</strong>: no
        es equivalente a los € de Blogabet ni a las u de Tipstrr o Golazobets. El yield es el ROI
        publicado por la fuente con base de stake inferida (la página no muestra el total apostado):
        no es una cifra recalculada. Campos no capturados o no verificados: guion (null), nunca 0.
        Esta página no está conectada a datos, no está enlazada desde la app y solo existe con{' '}
        <code>LAB_PREVIEW=1</code> (sin ella responde 404).
      </p>
      {rows.map(({ slug, nota, error, card }) => (
        <div key={slug} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: '#8a6d3b', background: '#fcf8e3', border: '1px solid #faebcc', borderRadius: 4, padding: '4px 10px', marginBottom: 4 }}>
            {slug} — {nota}
          </div>
          {error !== null ? (
            <div style={{ fontSize: 13, color: '#a94442' }}>mapeo rechazado: {error}</div>
          ) : (
            card && <TipsterRow tipster={card} />
          )}
        </div>
      ))}
    </div>
  )
}
