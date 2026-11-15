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

export interface FichaSnapshot {
  capturedAt: string
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
    profitDisplay: string | null // source display at 10/10=£10
    roiPct: number | null
    roiPeriodLabel: string
  }
  months: FichaMonth[]
  consistency: { name: string; passed: boolean }[]
  yieldEquivalenceNote: string
  periodEstimates?: { yield3m: number | null; yield6m: number | null; yield12m: number | null; picks6mAvg: number | null; note: string }
  notAvailable: { field: string; reason: string }[]
}

export const STATMIND_SNAPSHOT: FichaSnapshot = {
  capturedAt: '2026-11-15 12:48-12:53 UTC',
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
    profitDisplay: '-£591.25',
    roiPct: -20.32,
    roiPeriodLabel: 'periodo overview: 3 meses; tabla deporte (todo su historial) muestra -20.3% sobre los mismos 291 tips',
  },
  months: [
    { label: 'Nov 2026', closed: false, tips: 193, winRatePct: 32, profitLabel: '-£412.05', roiPct: -21.4, avgOdds: 3.01 },
    { label: 'Oct 2026', closed: true, partialSinceSignup: true, tips: 98, winRatePct: 32, profitLabel: '-£179.20', roiPct: -18.3, avgOdds: 2.76 },
  ],
  consistency: [
    { name: 'tabla de stakes: una sola banda (10/10)', passed: true },
    { name: 'tips tabla stakes (291) = tips overview (291)', passed: true },
    { name: 'stake medio (1.0) = banda uniforme', passed: true },
    { name: 'profit advised = level stake', passed: true },
    { name: 'ROI advised = ROI level stake', passed: true },
    { name: 'roi = profit / total apostado cierra (-59.13/291 = -20.32%)', passed: true },
  ],
  yieldEquivalenceNote:
    'ROI de Tipstrr = profit / total apostado, la fórmula del yield usada en Blogabet. Equivalencia verificada al céntimo EN ESTE REGISTRO (stake plano; advised = level). Voids: no hay en su historial; tratamiento general sin verificar. Esto reconcilia sus agregados; no es una auditoría apuesta a apuesta (detalle individual requiere cuenta).',
  notAvailable: [
    { field: 'yield 3m / 6m / 12m', reason: 'historial insuficiente: solo 1 mes cerrado (oct, parcial desde el alta 25-oct). No se agregan porcentajes redondeados ni se deriva apostado de ROI redondeado.' },
    { field: 'verifiedPct (BB)', reason: 'no existe en Tipstrr como porcentaje parcial; su claim "verificamos todo" no es una métrica mostrada' },
    { field: 'resetCount (BB)', reason: 'Tipstrr no expone resets de estadísticas' },
    { field: 'followers', reason: 'no presente en el estado de la página pública' },
    { field: 'país / bandera', reason: 'no expuesto' },
    { field: 'desglose free/paid (BB)', reason: 'la marca existe por tip pero el agregado requiere cuenta' },
    { field: 'primera apuesta (since BB)', reason: 'solo consta alta de cuenta (25-oct-2026), no fecha de primera apuesta' },
    { field: 'profit/odds por apuesta', reason: 'bloqueado tras registro de cuenta Tipstrr' },
  ],
}

// REAL one-off snapshot of The Least Expected's public Tipstrr stats,
// captured 2026-11-15 ~13:00-13:01 UTC from
// https://tipstrr.com/tipster/the-least-expected/stats (anonymous read).
// Breakdown tables on that page follow its "Show stats for" period
// selector: in this capture they cover 282 recent tips while the monthly
// table covers all-time (1974). Dated capture, not a sync.
export const TLE_SNAPSHOT: FichaSnapshot = {
  capturedAt: '2026-11-15 13:00-13:01 UTC',
  sourceUrl: 'https://tipstrr.com/tipster/the-least-expected/stats',
  name: 'The Least Expected',
  platformLabel: 'Professional football tipster · Join from £39/mes (literal de la página)',
  signupDate: '2025-03-11',
  avatarUrl: 'https://cdn.tipstrr.com/central/portfolio/image/the-least-expected-xdlQ21p0.jpg',
  activeTipsNow: 2,
  lastResultVisibleLabel: null,
  overview: {
    tips: 1974,
    winRatePct: 35.76,
    avgOdds: 3.34,
    stakeLabel: '10/10 · plano 1u (21/21 meses)',
    profitDisplay: '+£3,618.15',
    roiPct: 18.33,
    roiPeriodLabel: 'overview all-time: 1974 tips; advised = level = 18.33%',
  },
  months: [
    { label: 'Nov 2026', closed: false, tips: 37, winRatePct: 41, profitLabel: '+£138.00', roiPct: 37.3, avgOdds: 3.31 },
    { label: 'Oct 2026', closed: true, tips: 78, winRatePct: 41, profitLabel: '+£272.50', roiPct: 34.9, avgOdds: 3.41 },
    { label: 'Sep 2026', closed: true, tips: 106, winRatePct: 34, profitLabel: '+£191.00', roiPct: 18.0, avgOdds: 3.48 },
    { label: 'Ago 2026', closed: true, tips: 136, winRatePct: 38, profitLabel: '+£352.50', roiPct: 25.9, avgOdds: 3.33 },
    { label: 'Jul 2026', closed: true, tips: 121, winRatePct: 31, profitLabel: '+£49.00', roiPct: 4.1, avgOdds: 3.46 },
    { label: 'Jun 2026', closed: true, tips: 146, winRatePct: 38, profitLabel: '+£404.50', roiPct: 27.7, avgOdds: 3.36 },
    { label: 'May 2026', closed: true, tips: 116, winRatePct: 36, profitLabel: '+£204.50', roiPct: 17.6, avgOdds: 3.29 },
    { label: 'Abr 2026', closed: true, tips: 77, winRatePct: 34, profitLabel: '+£63.75', roiPct: 8.3, avgOdds: 3.23 },
    { label: 'Mar 2026', closed: true, tips: 62, winRatePct: 40, profitLabel: '+£202.00', roiPct: 32.6, avgOdds: 3.30 },
    { label: 'Feb 2026', closed: true, tips: 47, winRatePct: 38, profitLabel: '+£127.50', roiPct: 27.1, avgOdds: 3.26 },
    { label: 'Ene 2026', closed: true, tips: 63, winRatePct: 33, profitLabel: '+£39.00', roiPct: 6.2, avgOdds: 3.20 },
    { label: 'Dic 2025', closed: true, tips: 48, winRatePct: 38, profitLabel: '+£84.00', roiPct: 17.5, avgOdds: 3.20 },
    { label: 'Nov 2025', closed: true, tips: 74, winRatePct: 46, profitLabel: '+£335.50', roiPct: 45.3, avgOdds: 3.25 },
    { label: 'Oct 2025', closed: true, tips: 118, winRatePct: 29, profitLabel: '-£48.00', roiPct: -4.1, avgOdds: 3.27 },
    { label: 'Sep 2025', closed: true, tips: 130, winRatePct: 33, profitLabel: '+£184.50', roiPct: 14.2, avgOdds: 3.43 },
    { label: 'Ago 2025', closed: true, tips: 136, winRatePct: 37, profitLabel: '+£312.50', roiPct: 23.0, avgOdds: 3.36 },
    { label: 'Jul 2025', closed: true, tips: 107, winRatePct: 37, profitLabel: '+£261.80', roiPct: 24.5, avgOdds: 3.38 },
    { label: 'Jun 2025', closed: true, tips: 135, winRatePct: 39, profitLabel: '+£385.80', roiPct: 28.6, avgOdds: 3.45 },
    { label: 'May 2025', closed: true, tips: 112, winRatePct: 31, profitLabel: '+£42.80', roiPct: 3.8, avgOdds: 3.32 },
    { label: 'Abr 2025', closed: true, tips: 86, winRatePct: 29, profitLabel: '-£60.50', roiPct: -7.0, avgOdds: 3.23 },
    { label: 'Mar 2025', closed: true, partialSinceSignup: true, tips: 39, winRatePct: 36, profitLabel: '+£75.50', roiPct: 19.4, avgOdds: 3.29 },
  ],
  consistency: [
    { name: 'tabla de stakes: una sola banda (10/10)', passed: true },
    { name: 'stake plano all-time: apostado = tips en los 21 meses (Σ apostado = 1974 = overview tips)', passed: true },
    { name: 'stake medio (1.0) = banda uniforme', passed: true },
    { name: 'profit advised = level stake (361.82)', passed: true },
    { name: 'ROI advised = ROI level stake (18.33)', passed: true },
    { name: 'roi = profit / total apostado cierra (361.82/1974 = 18.33%)', passed: true },
    { name: 'suma mensual = overview (1974 tips, £3,618.15)', passed: true },
  ],
  yieldEquivalenceNote:
    'ROI de Tipstrr = profit / total apostado, la fórmula del yield usada en Blogabet. Equivalencia verificada all-time en este registro: la fuente publica apostado exacto por mes y es = tips en los 21 meses (stake plano 1u, Σ = 1974 = overview), advised = level, y profit/ROI cierran al céntimo. No se deriva nada de porcentajes redondeados.',
  periodEstimates: {
    yield3m: 25.5, yield6m: 21.0, yield12m: 21.7, picks6mAvg: 117,
    note: 'Calculado como Σprofit/Σapostado de meses cerrados con cifras exactas de la fuente (no derivado de ROI redondeado). Cobertura: 3m = ago–oct 2026 · 6m = may–oct 2026 · 12m = nov 2025–oct 2026. Picks/mes = media exacta (703 tips / 6 meses).',
  },
  notAvailable: [
    { field: 'verifiedPct (BB)', reason: 'no existe en Tipstrr como porcentaje parcial' },
    { field: 'resetCount (BB)', reason: 'Tipstrr no expone resets de estadísticas' },
    { field: 'followers', reason: 'no presente en el estado de la página pública' },
    { field: 'país / bandera', reason: 'no expuesto' },
    { field: 'desglose free/paid (BB)', reason: 'la marca existe por tip pero el agregado requiere cuenta' },
    { field: 'profit/odds por apuesta', reason: 'bloqueado tras registro de cuenta Tipstrr' },
  ],
}
