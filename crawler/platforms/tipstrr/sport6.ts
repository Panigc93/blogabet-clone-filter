// sport/6 = respuesta de /api/portfolio/<slug>/stats/sport/6: totales
// ALL-TIME ACONSEJADOS por deporte, independientes del overview embebido en
// la página /stats (que para 111 perfiles era una ventana rodante, no el
// histórico). Capturado 2026-11-15 a ritmo ~12.5s/req para esos 111.
//
// Este módulo inyecta los totales sport/6 como overview all-time de la
// snapshot. La puerta estricta de to-db.ts RE-VERIFICA entonces el cierre
// de 3 cifras (tips == Σtips, roi aconsejado == Σprofit/Σstaked ±0.05,
// profit == Σprofit ±0.01) contra la serie mensual embebida: si el cierre
// no cuadra, el perfil va a cuarentena como siempre. No se fabrican datos:
// el override solo SUSTITUYE la fuente del total por una independiente y
// verificable, con procedencia declarada en roiPeriodLabel.

import type { FichaSnapshot } from '@/app/lab/tipstrr/ficha/fixtures'

export interface Sport6Stat {
  sportId: number
  tips: number
  staked: number
  profit: number
  win: number
  lose: number
  void: number
}

export interface Sport6Capture {
  slug: string
  source: string
  capturedAt: string
  stats: Sport6Stat[]
}

export interface Sport6Totals {
  tips: number
  staked: number
  profit: number
  roiPct: number | null // base ACONSEJADA: profit/staked, nunca derivada del ROI redondeado
  winRatePct: number | null // win/(win+lose), mismo criterio que winPercentage de la fuente
}

const round2 = (n: number) => Math.round(n * 100) / 100
const round3 = (n: number) => Math.round(n * 1000) / 1000

export function sport6Totals(cap: Sport6Capture): Sport6Totals {
  const tips = cap.stats.reduce((a, s) => a + s.tips, 0)
  const staked = cap.stats.reduce((a, s) => a + s.staked, 0)
  const profit = cap.stats.reduce((a, s) => a + s.profit, 0)
  const win = cap.stats.reduce((a, s) => a + s.win, 0)
  const lose = cap.stats.reduce((a, s) => a + s.lose, 0)
  return {
    tips,
    staked: round3(staked),
    profit: round3(profit),
    roiPct: staked > 0 ? round2((profit / staked) * 100) : null,
    winRatePct: win + lose > 0 ? Math.round((100 * win) / (win + lose)) : null,
  }
}

// Devuelve una NUEVA snapshot con el overview sustituido por los totales
// sport/6 (semántica all-time, overviewPeriod=6) y la procedencia declarada.
// La serie mensual (monthState) NO se toca: es la referencia del cierre.
export function applySport6AllTime(
  snap: FichaSnapshot,
  totals: Sport6Totals,
  capturedLabel: string
): FichaSnapshot {
  return {
    ...snap,
    overviewPeriod: 6,
    overview: {
      ...snap.overview,
      tips: totals.tips,
      profitUnits: totals.profit,
      roiPct: totals.roiPct,
      winRatePct: totals.winRatePct ?? snap.overview.winRatePct,
      roiPeriodLabel: `totales all-time advised de /api/portfolio/<slug>/stats/sport/6 (${capturedLabel}); cierre de 3 cifras re-verificado por la puerta contra la serie mensual embebida`,
    },
  }
}
