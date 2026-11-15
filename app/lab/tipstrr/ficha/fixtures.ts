// REAL one-off snapshot of StatMind's public Tipstrr stats, captured
// 2026-11-15 ~12:48-12:53 UTC from https://tipstrr.com/tipster/statmind/stats
// (anonymous read) and validated with crawler/platforms/tipstrr/stats-state.ts.
// Aggregate figures only; per-tip odds/profit require a Tipstrr account.
// This file is a labeled point-in-time capture for UI development, not a
// sync: this capture is dated and may not reflect current figures.

export interface FichaMonth {
  label: string
  closed: boolean
  partialSinceSignup?: boolean
  tips: number | null
  winRatePct: number | null
  profitLabel: string // source's own display, currency as shown
  roiPct: number | null
  avgOdds: number | null
}

export interface FichaMonthState {
  year: number
  month: number // 1-12
  tips: number
  staked: number // exact units staked, from the source's own monthly figures
  profit: number // exact units profit, from the source's own monthly figures
}

export interface FichaSnapshot {
  capturedAt: string
  capturedAtDate: string // ISO instant: closed-month cutoff for period computation
  monthState: FichaMonthState[]
  sourceUrl: string
  name: string
  platformLabel: string // verbatim account-type label from the page
  signupDate: string // account creation (dateCreated), NOT first-bet date
  avatarUrl: string | null
  activeTipsNow: number | null
  lastResultVisibleLabel: string | null // latest visible result card date
  overview: {
    tips: number | null
    winRatePct: number | null
    avgOdds: number | null
    stakeLabel: string | null
    profitDisplay: string | null // source display at 10/10=10 € (cuenta con divisa EUR y stake 10 €; verificado 15-11-2026)
    // Profit advised EN UNIDADES tal cual lo emite el estado (overview.profit),
    // acotado al periodo del overview. Lo usa la puerta para el cierre numérico
    // contra la serie; null en fixtures antiguos = cierre no computable.
    profitUnits?: number | null
    roiPct: number | null
    roiPeriodLabel: string
    // Inicio de la ventana del overview tal cual lo emite el estado
    // (overview.periodStartDate, ISO). La puerta lo exige <= fecha de alta
    // exacta para aceptar una ventana rodante como all-time por igualdad.
    periodStartDate?: string | null
  }
  months: FichaMonth[]
  consistency: { name: string; passed: boolean }[]
  // Codigo de periodo del overview tal cual lo emite el estado (3/4/5/6
  // observados 2026-11-15; 6 = all-time). 3/4/5 son ventanas rodantes:
  // NO reproducibles desde buckets mensuales (verificado contra 209
  // capturas: ninguna ventana de meses naturales cuadra de forma general).
  overviewPeriod: number | null
  yieldEquivalenceNote: string
  notAvailable: { field: string; reason: string }[]
}

export const STATMIND_SNAPSHOT: FichaSnapshot = {
  capturedAt: '2026-11-15 13:46-13:50 UTC',
  capturedAtDate: '2026-11-15T13:50:00Z',
  monthState: [
    { year: 2026, month: 11, tips: 193, staked: 193, profit: -41.205 },
    { year: 2026, month: 10, tips: 98, staked: 98, profit: -17.92 },
  ],
  sourceUrl: 'https://tipstrr.com/tipster/statmind/stats',
  name: 'StatMind',
  platformLabel: 'Free football tipster',
  signupDate: '2026-10-25',
  avatarUrl: 'https://cdn.tipstrr.com/central/portfolio/image/statmind-G8XbOvrx.jpg',
  activeTipsNow: 0,
  lastResultVisibleLabel: '7 nov 2026 (fecha de publicación visible en tarjeta; no verificada como fecha exacta)',
  overview: {
    tips: 291,
    winRatePct: 32,
    avgOdds: 2.93,
    stakeLabel: '10/10 (291/291)',
    profitDisplay: '-591,25 €',
    profitUnits: -59.13,
    roiPct: -20.32,
    periodStartDate: '2026-08-09T00:00:00Z', // estado real: inicio de ventana anterior al alta (2026-10-25)
    roiPeriodLabel: 'periodo overview: 3 meses; tabla deporte (todo su historial) muestra -20.3% sobre los mismos 291 tips',
  },
  months: [
    { label: 'Nov 2026', closed: false, tips: 193, winRatePct: 32, profitLabel: '-412,05 €', roiPct: -21.4, avgOdds: 3.01 },
    { label: 'Oct 2026', closed: true, partialSinceSignup: true, tips: 98, winRatePct: 32, profitLabel: '-179,20 €', roiPct: -18.3, avgOdds: 2.76 },
  ],
  consistency: [
    { name: 'tabla de stakes: una sola banda (10/10)', passed: true },
    { name: 'tips tabla stakes (291) = tips overview (291)', passed: true },
    { name: 'stake medio (1.0) = banda uniforme', passed: true },
    { name: 'profit advised = level stake', passed: true },
    { name: 'ROI advised = ROI level stake', passed: true },
    { name: 'roi = profit / total apostado cierra (-59.13/291 = -20.32%)', passed: true },
  ],
  overviewPeriod: 3,
  yieldEquivalenceNote:
    'ROI de Tipstrr = profit / total apostado, la fórmula del yield usada en Blogabet. Equivalencia verificada al céntimo EN ESTE REGISTRO (stake plano; advised = level). Voids: no hay en su historial; tratamiento general sin verificar. Esto reconcilia sus agregados; no es una auditoría apuesta a apuesta. Divisa: con la cuenta en EUR (stake 10 € = 10 units) la fuente muestra los mismos números en € — normalización de unidad (unidades × tu stake), NO conversión FX; el ROI/yield % no cambia.',
  notAvailable: [
    { field: 'yield 3m / 6m / 12m completo', reason: 'historial insuficiente: solo 1 mes cerrado (oct, parcial desde el alta 25-oct); el bloque de periodos lo muestra marcado como ventana incompleta' },
    { field: 'verifiedPct (BB)', reason: 'no existe en Tipstrr como porcentaje parcial; su claim "verificamos todo" no es una métrica mostrada' },
    { field: 'resetCount (BB)', reason: 'Tipstrr no expone resets de estadísticas' },
    { field: 'followers', reason: 'no presente en el estado de la página' },
    { field: 'país / bandera', reason: 'no expuesto' },
    { field: 'desglose free/paid agregado (BB)', reason: 'ni agregado ni conteo mensual free: el flag `free` por apuesta liquidada falló el control (StatMind, tipster free, da 10/10 false igual que TLE 200/200, 15-11-2026); hipótesis sin confirmar: marca visibilidad del pick activo, no historial. Conteo mensual free = no evaluable' },
    { field: 'primera apuesta (since BB)', reason: 'solo consta alta de cuenta (25-oct-2026), no fecha de primera apuesta' },
  ],
}

// REAL one-off snapshot of The Least Expected's public Tipstrr stats,
// captured 2026-11-15 ~13:46-13:49 UTC from
// https://tipstrr.com/tipster/the-least-expected/stats (authenticated read
// with the user's account, currency EUR: same numbers as anonymous GBP,
// unit normalization 10 units = 10 €, NOT an FX conversion; verified
// figure-by-figure against the anonymous £ page on 2026-11-15).
// Breakdown tables on that page follow its "Show stats for" period
// selector: in this capture they cover 282 recent tips while the monthly
// table covers all-time (1974). Dated capture, not a sync.
export const TLE_SNAPSHOT: FichaSnapshot = {
  capturedAt: '2026-11-15 13:46-13:49 UTC',
  capturedAtDate: '2026-11-15T13:49:00Z',
  // Exact monthly figures from the page's own STATS_MONTH (units; staked
  // equals tips in all 21 months: flat 1u staking, verified against the
  // capture).
  monthState: [
    { year: 2026, month: 11, tips: 37, staked: 37, profit: 13.8 },
    { year: 2026, month: 10, tips: 78, staked: 78, profit: 27.25 },
    { year: 2026, month: 9, tips: 106, staked: 106, profit: 19.1 },
    { year: 2026, month: 8, tips: 136, staked: 136, profit: 35.25 },
    { year: 2026, month: 7, tips: 121, staked: 121, profit: 4.9 },
    { year: 2026, month: 6, tips: 146, staked: 146, profit: 40.45 },
    { year: 2026, month: 5, tips: 116, staked: 116, profit: 20.45 },
    { year: 2026, month: 4, tips: 77, staked: 77, profit: 6.375 },
    { year: 2026, month: 3, tips: 62, staked: 62, profit: 20.2 },
    { year: 2026, month: 2, tips: 47, staked: 47, profit: 12.75 },
    { year: 2026, month: 1, tips: 63, staked: 63, profit: 3.9 },
    { year: 2025, month: 12, tips: 48, staked: 48, profit: 8.4 },
    { year: 2025, month: 11, tips: 74, staked: 74, profit: 33.55 },
    { year: 2025, month: 10, tips: 118, staked: 118, profit: -4.8 },
    { year: 2025, month: 9, tips: 130, staked: 130, profit: 18.45 },
    { year: 2025, month: 8, tips: 136, staked: 136, profit: 31.25 },
    { year: 2025, month: 7, tips: 107, staked: 107, profit: 26.18 },
    { year: 2025, month: 6, tips: 135, staked: 135, profit: 38.58 },
    { year: 2025, month: 5, tips: 112, staked: 112, profit: 4.28 },
    { year: 2025, month: 4, tips: 86, staked: 86, profit: -6.05 },
    { year: 2025, month: 3, tips: 39, staked: 39, profit: 7.55 },
  ],
  sourceUrl: 'https://tipstrr.com/tipster/the-least-expected/stats',
  name: 'The Least Expected',
  platformLabel: 'Professional football tipster · Join from £39/mes (literal de la página)',
  signupDate: '2025-03-11',
  avatarUrl: 'https://cdn.tipstrr.com/central/portfolio/image/the-least-expected-xdlQ21p0.jpg',
  activeTipsNow: 1,
  lastResultVisibleLabel: null,
  overview: {
    tips: 1974,
    winRatePct: 35.76,
    avgOdds: 3.34,
    stakeLabel: '10/10 · plano 1u (21/21 meses)',
    profitDisplay: '+3.618,15 €',
    profitUnits: 361.82,
    roiPct: 18.33,
    periodStartDate: '2025-03-11T00:00:00Z',
    roiPeriodLabel: 'overview all-time: 1974 tips; advised = level = 18.33%',
  },
  months: [
    { label: 'Nov 2026', closed: false, tips: 37, winRatePct: 41, profitLabel: '+138,00 €', roiPct: 37.3, avgOdds: 3.31 },
    { label: 'Oct 2026', closed: true, tips: 78, winRatePct: 41, profitLabel: '+272,50 €', roiPct: 34.9, avgOdds: 3.41 },
    { label: 'Sep 2026', closed: true, tips: 106, winRatePct: 34, profitLabel: '+191,00 €', roiPct: 18.0, avgOdds: 3.48 },
    { label: 'Ago 2026', closed: true, tips: 136, winRatePct: 38, profitLabel: '+352,50 €', roiPct: 25.9, avgOdds: 3.33 },
    { label: 'Jul 2026', closed: true, tips: 121, winRatePct: 31, profitLabel: '+49,00 €', roiPct: 4.1, avgOdds: 3.46 },
    { label: 'Jun 2026', closed: true, tips: 146, winRatePct: 38, profitLabel: '+404,50 €', roiPct: 27.7, avgOdds: 3.36 },
    { label: 'May 2026', closed: true, tips: 116, winRatePct: 36, profitLabel: '+204,50 €', roiPct: 17.6, avgOdds: 3.29 },
    { label: 'Abr 2026', closed: true, tips: 77, winRatePct: 34, profitLabel: '+63,75 €', roiPct: 8.3, avgOdds: 3.23 },
    { label: 'Mar 2026', closed: true, tips: 62, winRatePct: 40, profitLabel: '+202,00 €', roiPct: 32.6, avgOdds: 3.30 },
    { label: 'Feb 2026', closed: true, tips: 47, winRatePct: 38, profitLabel: '+127,50 €', roiPct: 27.1, avgOdds: 3.26 },
    { label: 'Ene 2026', closed: true, tips: 63, winRatePct: 33, profitLabel: '+39,00 €', roiPct: 6.2, avgOdds: 3.20 },
    { label: 'Dic 2025', closed: true, tips: 48, winRatePct: 38, profitLabel: '+84,00 €', roiPct: 17.5, avgOdds: 3.20 },
    { label: 'Nov 2025', closed: true, tips: 74, winRatePct: 46, profitLabel: '+335,50 €', roiPct: 45.3, avgOdds: 3.25 },
    { label: 'Oct 2025', closed: true, tips: 118, winRatePct: 29, profitLabel: '-48,00 €', roiPct: -4.1, avgOdds: 3.27 },
    { label: 'Sep 2025', closed: true, tips: 130, winRatePct: 33, profitLabel: '+184,50 €', roiPct: 14.2, avgOdds: 3.43 },
    { label: 'Ago 2025', closed: true, tips: 136, winRatePct: 37, profitLabel: '+312,50 €', roiPct: 23.0, avgOdds: 3.36 },
    { label: 'Jul 2025', closed: true, tips: 107, winRatePct: 37, profitLabel: '+261,80 €', roiPct: 24.5, avgOdds: 3.38 },
    { label: 'Jun 2025', closed: true, tips: 135, winRatePct: 39, profitLabel: '+385,80 €', roiPct: 28.6, avgOdds: 3.45 },
    { label: 'May 2025', closed: true, tips: 112, winRatePct: 31, profitLabel: '+42,80 €', roiPct: 3.8, avgOdds: 3.32 },
    { label: 'Abr 2025', closed: true, tips: 86, winRatePct: 29, profitLabel: '-60,50 €', roiPct: -7.0, avgOdds: 3.23 },
    { label: 'Mar 2025', closed: true, partialSinceSignup: true, tips: 39, winRatePct: 36, profitLabel: '+75,50 €', roiPct: 19.4, avgOdds: 3.29 },
  ],
  consistency: [
    { name: 'tabla de stakes: una sola banda (10/10)', passed: true },
    { name: 'stake plano all-time: apostado = tips en los 21 meses (Σ apostado = 1974 = overview tips)', passed: true },
    { name: 'stake medio (1.0) = banda uniforme', passed: true },
    { name: 'profit advised = level stake (361.82)', passed: true },
    { name: 'ROI advised = ROI level stake (18.33)', passed: true },
    { name: 'roi = profit / total apostado cierra (361.82/1974 = 18.33%)', passed: true },
    { name: 'suma mensual = overview (1974 tips, 3.618,15 €)', passed: true },
  ],
  overviewPeriod: 6,
  yieldEquivalenceNote:
    'ROI de Tipstrr = profit / total apostado, la fórmula del yield usada en Blogabet. Equivalencia verificada all-time en este registro: la fuente publica apostado exacto por mes y es = tips en los 21 meses (stake plano 1u, Σ = 1974 = overview), advised = level, y profit/ROI cierran al céntimo. No se deriva nada de porcentajes redondeados. Divisa: con la cuenta en EUR (stake 10 € = 10 units) la fuente muestra los mismos números en € — normalización de unidad, NO conversión FX; el ROI/yield % no cambia. La suscripción se cobra aparte y sigue en £ (Join from £39).',
  notAvailable: [
    { field: 'verifiedPct (BB)', reason: 'no existe en Tipstrr como porcentaje parcial' },
    { field: 'resetCount (BB)', reason: 'Tipstrr no expone resets de estadísticas' },
    { field: 'followers', reason: 'no presente en el estado de la página' },
    { field: 'país / bandera', reason: 'no expuesto' },
    { field: 'desglose free/paid agregado (BB)', reason: 'ni agregado ni conteo mensual free: el flag `free` por apuesta liquidada falló el control (StatMind, tipster free, da 10/10 false igual que TLE 200/200, 15-11-2026); hipótesis sin confirmar: marca visibilidad del pick activo, no historial. Conteo mensual free = no evaluable' },
    { field: 'línea insight de profit total', reason: 'la frase "total cumulative profit" de la página muestra 3.624 €, 5,85 € por encima de la suma mensual exacta (3.618,15 €) y del overview (361,82u): discrepancia interna de la fuente; usamos la serie mensual, que es la comprobable' },
  ],
}
