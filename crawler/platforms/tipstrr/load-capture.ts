// Offline loader: a dated Tipstrr /stats capture file -> FichaSnapshot.
//
// This is the ingestion half of the integration that can be built and
// tested WITHOUT new reads: it takes the raw embedded state the page itself
// ships (<script id="tipstrr-state">, quotes encoded as &q;) and produces
// the snapshot the table/ficha consume. It fetches nothing; freshness and
// cadence are decisions that stay with the owner.
//
// Scale: everything from the state is in Tipstrr UNITS. Money labels are
// produced only through the caller-provided formatMoney (the verified
// account display: units x configured stake, e.g. x10 EUR — a unit
// normalization, NOT an FX conversion). Never store money as source data.

import type {
  FichaSnapshot,
  FichaMonth,
  FichaMonthState,
} from '@/app/lab/tipstrr/ficha/fixtures'

export interface TipstrrStatsCapture {
  _meta?: Record<string, unknown>
  stateRaw: string // raw #tipstrr-state content, quotes encoded as &q;
}

// Fields the capture does NOT carry; they stay editorial, recorded by a
// human from the page at capture time (never invented by the loader).
export interface SnapshotEditorial {
  platformLabel: string // verbatim account-type label from the page
  stakeLabel: string | null
  roiPeriodLabel: string
  activeTipsNow?: number | null // default: portfolio.activeTips from state
  lastResultVisibleLabel: string | null
  yieldEquivalenceNote: string
  notAvailable: { field: string; reason: string }[]
}

export interface LoadSnapshotOptions {
  sourceUrl: string
  capturedAt: string
  capturedAtDate: string // ISO instant; decides which months are closed
  formatMoney?: (units: number) => string // default: raw units labelled "u"
  editorial: SnapshotEditorial
}

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// Half-away-from-zero round (toFixed is unreliable on x.xx5).
function round2(n: number): number {
  return (Math.sign(n) * Math.round(Math.abs(n) * 100)) / 100
}

// Monthly ROI as the page displays it: 1 decimal.
function round1(n: number): number {
  return (Math.sign(n) * Math.round(Math.abs(n) * 10)) / 10
}

// es-ES money: sign outside, "." grouping, "," decimals. 3618.15 -> "+3.618,15 €"
export function formatEsEur(amount: number, withSign = true): string {
  const sign = amount < 0 ? '-' : withSign ? '+' : ''
  const abs = Math.abs(amount)
  const [intPart, decPart] = abs.toFixed(2).split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}${grouped},${decPart} €`
}

interface StateMonthRow {
  date: string
  tips: number
  staked: number
  profit: number
  roi: number
  winPercentage: number
  averageOdds: number
}

interface StateStakeRow {
  stake: number
  tips: number
}

function firstValue(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) return null
  const keys = Object.keys(obj as object)
  return keys.length ? (obj as Record<string, unknown>)[keys[0]] : null
}

function decodeState(stateRaw: string): Record<string, unknown> {
  return JSON.parse(stateRaw.replace(/&q;/g, '"')) as Record<string, unknown>
}

export function loadTipstrrCapture(
  capture: TipstrrStatsCapture,
  opts: LoadSnapshotOptions
): FichaSnapshot {
  const state = decodeState(capture.stateRaw)
  const portfolio = firstValue(state.PORTFOLIO) as Record<string, unknown>
  if (!portfolio) throw new Error('tipstrr capture: PORTFOLIO missing')
  const overview = portfolio.overview as Record<string, unknown>
  const monthRows = (firstValue(state.STATS_MONTH) ?? []) as StateMonthRow[]
  const stakeRows = (firstValue(state.STATS_STAKE) ?? []) as StateStakeRow[]
  const formatMoney = opts.formatMoney ?? ((u: number) => `${round2(u)} u`)

  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

  const overviewTips = num(overview.tips)
  const overviewProfit = num(overview.profit)
  const overviewRoi = num(overview.roi)
  const levelProfit = num(overview.levelStakeProfit)
  const levelRoi = num(overview.levelStakeROI)
  const avgStake = num(overview.averageStake) // may be absent in state
  const dateCreated = str(portfolio.dateCreated)
  const signupYm = dateCreated ? dateCreated.slice(0, 7) : null
  const capYm = opts.capturedAtDate.slice(0, 7)

  // ── monthly series (exact source figures) ─────────────────────────────
  const monthState: FichaMonthState[] = monthRows.map((r) => ({
    year: parseInt(r.date.slice(0, 4), 10),
    month: parseInt(r.date.slice(5, 7), 10),
    tips: r.tips,
    staked: r.staked,
    profit: r.profit,
  }))

  const months: FichaMonth[] = monthRows.map((r) => {
    const ym = r.date.slice(0, 7)
    const y = parseInt(r.date.slice(0, 4), 10)
    const m = parseInt(r.date.slice(5, 7), 10)
    return {
      label: `${MONTHS_ES[m - 1]} ${y}`,
      closed: ym < capYm,
      ...(ym === signupYm ? { partialSinceSignup: true } : {}),
      tips: r.tips,
      winRatePct: num(r.winPercentage),
      profitLabel: formatMoney(r.profit),
      roiPct: typeof r.roi === 'number' ? round1(r.roi) : null,
      avgOdds: r.averageOdds != null ? round2(r.averageOdds) : null,
    }
  })

  const sumTips = monthRows.reduce((s, r) => s + r.tips, 0)
  const sumStaked = monthRows.reduce((s, r) => s + r.staked, 0)
  const sumProfit = monthRows.reduce((s, r) => s + r.profit, 0)
  const flatStaking = monthRows.length > 0 && monthRows.every((r) => r.staked === r.tips)

  // ── stake bands from STATS_STAKE (period-selector scoped!) ────────────
  const nonZeroBands = stakeRows.filter((b) => b.tips > 0)
  const bandTotal = stakeRows.reduce((s, b) => s + b.tips, 0)
  const uniformBand = nonZeroBands.length === 1 ? nonZeroBands[0] : null
  const bandLabel = uniformBand ? `${uniformBand.stake * 10}/10` : null

  // ── consistency checks (same names the reviewed ficha records) ────────
  const consistency: { name: string; passed: boolean }[] = []
  if (uniformBand && bandLabel) {
    consistency.push({ name: `tabla de stakes: una sola banda (${bandLabel})`, passed: true })
  }
  if (overviewTips !== null && bandTotal === overviewTips) {
    consistency.push({
      name: `tips tabla stakes (${bandTotal}) = tips overview (${overviewTips})`,
      passed: true,
    })
  } else if (flatStaking && overviewTips !== null) {
    // STATS_STAKE can be scoped by the page's period selector; the monthly
    // series is the full-history check in that case.
    consistency.push({
      name: `stake plano all-time: apostado = tips en los ${monthRows.length} meses (Σ apostado = ${sumStaked} = overview tips)`,
      passed: sumStaked === overviewTips,
    })
  }
  if (avgStake !== null && uniformBand) {
    consistency.push({
      name: `stake medio (${avgStake.toFixed(1)}) = banda uniforme`,
      passed: Math.abs(avgStake - uniformBand.stake) < 0.01,
    })
  }
  if (overviewProfit !== null && levelProfit !== null) {
    consistency.push({
      name: `profit advised = level stake (${round2(overviewProfit)})`,
      passed: Math.abs(overviewProfit - levelProfit) < 0.01,
    })
  }
  if (overviewRoi !== null && levelRoi !== null) {
    consistency.push({
      name: `ROI advised = ROI level stake (${round2(overviewRoi)})`,
      passed: Math.abs(overviewRoi - levelRoi) < 0.01,
    })
  }
  if (overviewProfit !== null && overviewTips && overviewRoi !== null && sumStaked > 0) {
    const derived = (overviewProfit / sumStaked) * 100
    consistency.push({
      name: `roi = profit / total apostado cierra (${round2(overviewProfit)}/${overviewTips} = ${overviewRoi}%)`,
      passed: Math.abs(derived - overviewRoi) < 0.05,
    })
  }
  if (monthRows.length >= 3 && overviewTips !== null) {
    consistency.push({
      name: `suma mensual = overview (${sumTips} tips, ${formatEsEur(sumProfit * 10, false)})`,
      passed: sumTips === overviewTips && overviewProfit !== null && Math.abs(sumProfit - overviewProfit) < 0.01,
    })
  }

  return {
    capturedAt: opts.capturedAt,
    capturedAtDate: opts.capturedAtDate,
    monthState,
    sourceUrl: opts.sourceUrl,
    name: str(portfolio.name) ?? '',
    platformLabel: opts.editorial.platformLabel,
    signupDate: dateCreated ? dateCreated.slice(0, 10) : '',
    avatarUrl: str(portfolio.profileImageUrl),
    activeTipsNow: opts.editorial.activeTipsNow ?? num(portfolio.activeTips),
    lastResultVisibleLabel: opts.editorial.lastResultVisibleLabel,
    overview: {
      tips: overviewTips,
      winRatePct: num(overview.winPercentage),
      avgOdds: num(overview.oddsTotal),
      stakeLabel: opts.editorial.stakeLabel,
      // Monthly sum (exact) x the account's configured unit stake: the
      // source's own EUR rendering is this same unit normalization.
      profitDisplay: monthRows.length > 0 ? formatMoney(sumProfit) : null,
      roiPct: overviewRoi,
      roiPeriodLabel: opts.editorial.roiPeriodLabel,
    },
    months,
    consistency,
    yieldEquivalenceNote: opts.editorial.yieldEquivalenceNote,
    notAvailable: opts.editorial.notAvailable,
  }
}
