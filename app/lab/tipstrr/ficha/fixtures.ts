// REAL one-off snapshot of StatMind's public Tipstrr stats, captured
// 2026-11-15 ~12:48-12:53 UTC from https://tipstrr.com/tipster/statmind/stats
// (anonymous read) and validated with crawler/platforms/tipstrr/stats-state.ts.
// Aggregate figures only; per-tip odds/profit require a Tipstrr account.
// This file is a labeled point-in-time capture for UI development, not a
// sync: figures go stale (their stats update every 24h).

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
