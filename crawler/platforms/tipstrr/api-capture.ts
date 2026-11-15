// Captura COMPACTA por API (2026-11-15): los tres endpoints publicos que la
// propia UI llama al elegir "All time" (sonda alltime-selector-probe-1086):
//   /api/portfolio/<slug>                    -> identidad, alta, tipo, overview rodante
//   /api/portfolio/<slug>/stats/month/6      -> serie mensual all-time (identica a la embebida)
//   /api/portfolio/<slug>/stats/sport/6      -> totales ADVISED all-time por deporte
//
// Sustituye a la captura del estado embebido (#tipstrr-state, cientos de KB)
// para la recogida de catalogo: mismo contrato FichaSnapshot, misma puerta
// estricta de to-db (overview sport/6 con overviewPeriod=6 contra la serie
// month/6: dos agregaciones independientes del servidor, como en la
// validacion de los 101). Nada se fabrica: si el cierre no cuadra, cuarentena.

import type { FichaMonth, FichaMonthState, FichaSnapshot } from '@/app/lab/tipstrr/ficha/fixtures'
import { sport6Totals, type Sport6Stat } from './sport6'

export interface ApiMonthRow {
  date: string // '2026-11-01T00:00:00Z'
  tips: number
  staked: number
  profit: number
  winPercentage?: number
  roi?: number
  averageOdds?: number | null
}

export interface ApiPortfolio {
  name: string
  reference: string
  profileImageUrl?: string | null
  type?: number // 1=free, 2=premium (documentado en select#discover-type)
  dateCreated?: string
  activeTips?: number | null
}

export interface TipstrrApiCapture {
  _meta: {
    source: 'tipstrr-api-compact'
    slug: string
    captured: string // ISO instant
    endpoints: string[]
  }
  portfolio: ApiPortfolio
  month6: ApiMonthRow[]
  sport6: Sport6Stat[]
}

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100

export function apiCaptureToSnapshot(cap: TipstrrApiCapture): FichaSnapshot {
  const capturedIso = cap._meta.captured
  const capYm = capturedIso.slice(0, 7)
  const signupDate = cap.portfolio.dateCreated ? cap.portfolio.dateCreated.slice(0, 10) : ''
  const signupYm = signupDate.slice(0, 7)

  const monthState: FichaMonthState[] = cap.month6.map((r) => ({
    year: parseInt(r.date.slice(0, 4), 10),
    month: parseInt(r.date.slice(5, 7), 10),
    tips: r.tips,
    staked: r.staked,
    profit: r.profit,
  }))

  const months: FichaMonth[] = cap.month6.map((r) => {
    const ym = r.date.slice(0, 7)
    const y = parseInt(r.date.slice(0, 4), 10)
    const m = parseInt(r.date.slice(5, 7), 10)
    return {
      label: `${MONTHS_ES[m - 1]} ${y}`,
      closed: ym < capYm,
      ...(ym === signupYm ? { partialSinceSignup: true } : {}),
      tips: r.tips,
      winRatePct: typeof r.winPercentage === 'number' ? r.winPercentage : null,
      profitLabel: `${round2(r.profit)} u`,
      roiPct: typeof r.roi === 'number' ? round1(r.roi) : null,
      avgOdds: r.averageOdds != null ? round2(r.averageOdds) : null,
    }
  })

  const totals = sport6Totals({ slug: cap._meta.slug, source: 'api', capturedAt: capturedIso, stats: cap.sport6 })
  const isPaid = cap.portfolio.type === 2

  return {
    capturedAt: capturedIso,
    capturedAtDate: capturedIso,
    monthState,
    months,
    sourceUrl: `https://tipstrr.com/tipster/${cap._meta.slug}/stats`,
    name: cap.portfolio.name,
    platformLabel: isPaid ? 'Premium (type=2 del endpoint portfolio)' : 'Free (type=1 del endpoint portfolio)',
    signupDate,
    avatarUrl: cap.portfolio.profileImageUrl ?? null,
    activeTipsNow: cap.portfolio.activeTips ?? null,
    lastResultVisibleLabel: null,
    overview: {
      tips: totals.tips,
      winRatePct: totals.winRatePct,
      avgOdds: null, // agregado multi-deporte no emitido por la fuente; ausente, no inventado
      stakeLabel: null,
      profitDisplay: null,
      profitUnits: totals.profit,
      roiPct: totals.roiPct,
      roiPeriodLabel: `totales all-time advised de /api/portfolio/<slug>/stats/sport/6 (${capturedIso.slice(0, 10)}); cierre de 3 cifras re-verificado por la puerta contra la serie month/6`,
      periodStartDate: null,
    },
    overviewPeriod: 6,
    consistency: [],
    yieldEquivalenceNote: 'ROI Tipstrr = profit/staked (base advised); yield = roi del overview sport/6 tras cierre',
    notAvailable: [
      { field: 'subscriptionPriceGbp', reason: 'precio no capturado en esta fase (membership del endpoint, semantica no verificada)' },
      { field: 'lastPickAt', reason: 'granularidad mensual; no hay fecha de pick en la captura API' },
    ],
  }
}

export { isPaidFromApiCapture }
function isPaidFromApiCapture(cap: TipstrrApiCapture): boolean {
  return cap.portfolio.type === 2
}
