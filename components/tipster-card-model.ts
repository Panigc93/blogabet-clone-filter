import type { Tipster } from '@/db/schema'
import type { FichaSnapshot } from '@/app/lab/tipstrr/ficha/fixtures'
import { computeExactPeriodStats } from '@/crawler/platforms/tipstrr/periods'

// Platform-agnostic view model for the tipster table row. The existing
// Blogabet path is preserved verbatim (fromDbTipster maps the DB row 1:1);
// Tipstrr rows come from dated real captures (fromTipstrrSnapshot), never
// presented as a sync: capturedAt is always shown.

export type Platform = 'blogabet' | 'tipstrr' | 'golazobets' | 'bet2invest'

export interface PeriodStatView {
  valuePct: number | null
  trace: string | null // e.g. '+£816.00 beneficio / 320u apostadas · ago 2026 – oct 2026 · 3/3 meses'
  complete: boolean
}

export interface TipsterCardData {
  platform: Platform
  name: string
  avatarUrl: string | null
  sourceUrl: string // external profile URL
  sourceLabel: string // displayed under the name
  capturedAt: string | null // null = live DB row (Blogabet); dated capture for Tipstrr
  sinceYear: number | null
  sinceTitle: string | null // what "since" means for this platform
  picks: number | null
  profitDisplay: string | null // already formatted, with currency
  yieldPct: number | null
  yieldTitle: string | null // provenance note for the yield figure
  verifiedPct: number | null // null = not exposed by the platform (never 0)
  followers: number | null // null = not exposed
  isVerified: boolean | null // null = concept not exposed
  isPaid: boolean
  priceLabel: string | null // e.g. '40' (BB, €) or '£39' (Tipstrr, literal page)
  priceCurrencySuffix: string | null // '€' for BB, null when priceLabel carries it
  resetCount: number
  resetTitle: string | null
  flagUrl: string | null
  countryCode: string | null
  yield3m: PeriodStatView
  yield6m: PeriodStatView
  yield12m: PeriodStatView
  picks6mAvg: number | null
  picks6mTrace: string | null
  picksFree3mAvg: number | null // BB paid-only split; null elsewhere
  yieldFree3m: number | null
  showPeriodRow: boolean
}

const MES_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmtYm = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return `${MES_ES[m - 1]} ${y}`
}
// EUR display, exactly as the source renders it with the user's account
// (Betting currency EUR, 10 units = 10 €): unit normalization, NOT an FX
// conversion — same numbers, € symbol, es-style format (1.234,56 €; always grouped, matching the source's own "3.624 €"). Verified live
// figure-by-figure against the anonymous £ page on 2026-11-15.
const fmtEs = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtMoney = (units: number) => `${units < 0 ? '-' : '+'}${fmtEs.format(Math.abs(units) * 10)} €`
const fmtMoneyAbs = (units: number) => `${fmtEs.format(Math.abs(units) * 10)} €`

export function fromDbTipster(t: Tipster): TipsterCardData {
  if (t.platform === 'tipstrr') return tipstrrFromDbRow(t)
  if (t.platform === 'golazobets') return golazobetsFromDbRow(t)
  if (t.platform === 'bet2invest') return bet2investFromDbRow(t)
  const num = (v: string | null): number | null => {
    if (v === null) return null
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  const profit = num(t.profit)
  const resetCount = Number(t.resetCount)
  const resetDate = t.lastResetAt ? new Date(t.lastResetAt) : null
  const resetLabel =
    resetDate && !isNaN(resetDate.getTime())
      ? `${String(resetDate.getUTCDate()).padStart(2, '0')}/${String(resetDate.getUTCMonth() + 1).padStart(2, '0')}/${resetDate.getUTCFullYear()}`
      : null
  const period = (v: string | null): PeriodStatView => ({ valuePct: num(v), trace: null, complete: true })
  return {
    platform: 'blogabet',
    name: t.name,
    avatarUrl: t.avatarUrl,
    sourceUrl: `https://${t.slug}.blogabet.com`,
    sourceLabel: `${t.slug}.blogabet.com`,
    capturedAt: null,
    sinceYear: t.sinceYear,
    sinceTitle: null,
    picks: t.picks,
    profitDisplay: profit !== null ? (profit >= 0 ? `+${Math.round(profit)}` : `${Math.round(profit)}`) : null,
    yieldPct: num(t.yield),
    yieldTitle: null,
    verifiedPct: num(t.verifiedPct),
    followers: t.followers,
    isVerified: t.isVerified,
    isPaid: t.isPaid,
    priceLabel: t.price !== null ? String(parseFloat(t.price)) : null,
    priceCurrencySuffix: '€',
    resetCount,
    resetTitle:
      resetCount > 0
        ? `Stats reseteadas ${resetCount} ${resetCount === 1 ? 'vez' : 'veces'}${resetLabel ? ` · Último reset: ${resetLabel}` : ''}`
        : null,
    flagUrl: t.flagUrl,
    countryCode: t.countryCode,
    yield3m: period(t.yield3m),
    yield6m: period(t.yield6m),
    yield12m: period(t.yield12m),
    picks6mAvg: num(t.picks6mAvg),
    picks6mTrace: null,
    picksFree3mAvg: num(t.picksFree3mAvg),
    yieldFree3m: num(t.yieldFree3m),
    showPeriodRow: t.yield6m != null || t.yield12m != null || t.picks6mAvg != null,
  }
}

// DB-backed Tipstrr row: same honesty rules as the lab snapshot path —
// capturedAt always shown (it is a dated capture, not a sync), profit in
// units with 'u', price labeled with its own currency (£), since = signup.
function tipstrrFromDbRow(t: Tipster): TipsterCardData {
  const num = (v: string | null): number | null => {
    if (v === null) return null
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  const profit = num(t.profit)
  const captured = t.capturedAt ? new Date(t.capturedAt) : null
  return {
    platform: 'tipstrr',
    name: t.name,
    avatarUrl: t.avatarUrl,
    sourceUrl: `https://tipstrr.com/tipster/${t.slug}/stats`,
    sourceLabel: `tipstrr.com/tipster/${t.slug}`,
    capturedAt: captured && !isNaN(captured.getTime()) ? captured.toISOString().slice(0, 10) : null,
    sinceYear: t.signupAt ? new Date(t.signupAt).getUTCFullYear() : null,
    sinceTitle: 'Año de alta en Tipstrr; no es fecha de primera apuesta',
    picks: t.picks,
    profitDisplay: profit !== null ? `${profit >= 0 ? '+' : ''}${profit} u` : null,
    yieldPct: num(t.yield),
    yieldTitle: 'Yield = beneficio / unidades apostadas (ROI publicado por Tipstrr, en unidades)',
    verifiedPct: num(t.verifiedPct),
    followers: t.followers,
    isVerified: t.isVerified,
    isPaid: t.isPaid,
    priceLabel: t.price !== null ? String(parseFloat(t.price)) : null,
    priceCurrencySuffix: t.priceCurrency === 'gbp' ? ' £' : (t.priceCurrency === 'eur' ? ' €' : null),
    resetCount: 0,
    resetTitle: 'Tipstrr no expone resets de estadísticas',
    flagUrl: t.flagUrl,
    countryCode: t.countryCode,
    yield3m: { valuePct: num(t.yield3m), trace: null, complete: true },
    yield6m: { valuePct: num(t.yield6m), trace: null, complete: true },
    yield12m: { valuePct: num(t.yield12m), trace: null, complete: true },
    picks6mAvg: num(t.picks6mAvg),
    picks6mTrace: null,
    picksFree3mAvg: null, // no evaluable en Tipstrr (control StatMind falló)
    yieldFree3m: null,
    showPeriodRow: t.yield6m != null || t.yield12m != null || t.picks6mAvg != null,
  }
}

export function fromTipstrrSnapshot(s: FichaSnapshot): TipsterCardData {
  const p = computeExactPeriodStats(s.monthState, new Date(s.capturedAtDate))
  // Indicators only assert a full period: an incomplete window shows '—'
  // (valuePct null) and its partial result stays visible only in the
  // labeled trace below the row. Traces use ONE unit (£ at the source's own
  // 10/10=£10) so the division is directly checkable.
  const period = (st: typeof p.yield3m, asked: number): PeriodStatView =>
    st === null
      ? { valuePct: null, trace: null, complete: false }
      : {
          valuePct: st.complete ? st.yieldPct : null,
          trace: `${fmtMoney(st.profit)} beneficio / ${fmtMoneyAbs(st.staked)} apostadas · ${st.from === st.to ? fmtYm(st.from) : `${fmtYm(st.from)} – ${fmtYm(st.to)}`} · ${st.months}/${asked} meses${st.complete ? '' : ' · ventana incompleta (resultado parcial, no es el periodo)'}`,
          complete: st.complete,
        }
  return {
    platform: 'tipstrr',
    name: s.name,
    avatarUrl: s.avatarUrl,
    sourceUrl: s.sourceUrl,
    sourceLabel: s.sourceUrl.replace('https://', '').replace('/stats', ''),
    capturedAt: s.capturedAt,
    sinceYear: s.signupDate ? Number(s.signupDate.slice(0, 4)) : null,
    sinceTitle: `Alta de la cuenta en Tipstrr (${s.signupDate}); no es fecha de primera apuesta`,
    picks: s.overview.tips,
    profitDisplay: s.overview.profitDisplay,
    yieldPct: s.overview.roiPct,
    // Tooltip only (no visual block): the all-time yield includes the current
    // month up to the capture date; 3/6/12m periods use closed months only.
    yieldTitle: `${s.yieldEquivalenceNote} El yield total incluye el mes en curso hasta la fecha de la captura; los periodos 3/6/12m usan solo meses cerrados.`,
    verifiedPct: null, // Tipstrr no expone % parcial; nunca 0
    followers: null, // no expuesto en la página pública
    isVerified: null, // no existe como marca parcial
    isPaid: s.platformLabel.toLowerCase().includes('join from'),
    priceLabel: s.platformLabel.match(/join from (£\d+)/i)?.[1] ?? null,
    priceCurrencySuffix: null,
    resetCount: 0,
    resetTitle: null,
    flagUrl: null,
    countryCode: null,
    yield3m: period(p.yield3m, 3),
    yield6m: period(p.yield6m, 6),
    yield12m: period(p.yield12m, 12),
    picks6mAvg: p.yield6m !== null && p.yield6m.complete ? p.picks6mAvg : null,
    picks6mTrace:
      p.picks6mAvg !== null && p.yield6m !== null
        ? `${p.yield6m.tips} tips / ${p.yield6m.months} meses${p.yield6m.complete ? '' : ' · ventana incompleta (no es media de 6 meses)'}`
        : null,
    picksFree3mAvg: null, // split free/paid no evaluable: flag por tip liquidado no validado (control 15-11-2026); no es cuestión de cuenta
    yieldFree3m: null,
    showPeriodRow: p.yield3m !== null || p.yield6m !== null || p.yield12m !== null,
  }
}

// DB-backed Golazobets row. Misma regla de honestidad que Tipstrr: capturedAt
// siempre visible (captura fechada, no sync). El profit va etiquetado con su
// unidad propia ('u' en la cifra): NO es equivalente a las 'u' de Tipstrr ni
// a los € de Blogabet, y la ordenación por profit la agrupa aparte
// (lib/query.ts). Campos no expuestos por la plataforma: null, nunca 0.
function golazobetsFromDbRow(t: Tipster): TipsterCardData {
  const num = (v: string | null): number | null => {
    if (v === null) return null
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  const profit = num(t.profit)
  const captured = t.capturedAt ? new Date(t.capturedAt) : null
  const empty = (): PeriodStatView => ({ valuePct: null, trace: null, complete: true })
  return {
    platform: 'golazobets',
    name: t.name,
    avatarUrl: t.avatarUrl,
    // Usernames con espacios/parentesis/tildes ('Apuestas Tx', 'Abreu13
    // (CamiPicks)', 'DOBLE ÁREA'): la URL va codificada, la etiqueta legible.
    sourceUrl: `https://golazobets.com/tipster/${encodeURIComponent(t.slug)}`,
    sourceLabel: `golazobets.com/tipster/${t.slug}`,
    capturedAt: captured && !isNaN(captured.getTime()) ? captured.toISOString().slice(0, 10) : null,
    sinceYear: t.sinceYear,
    sinceTitle: 'Año de la primera apuesta registrada en Golazobets (no es la fecha de alta en la plataforma)',
    picks: t.picks,
    profitDisplay: profit !== null ? `${profit >= 0 ? '+' : ''}${fmtEs.format(profit)} u` : null,
    yieldPct: num(t.yield),
    yieldTitle: 'Yield publicado por Golazobets (beneficio / total apostado); las unidades Golazobets no son equivalentes a € ni a las unidades de Tipstrr',
    verifiedPct: null, // win_rate no es % verificado: no se mezclan conceptos
    followers: null, // no expuesto por la plataforma
    isVerified: null,
    isPaid: t.isPaid,
    priceLabel: null, // precio premium no expuesto en lo capturado
    priceCurrencySuffix: null,
    resetCount: 0,
    resetTitle: null,
    flagUrl: null,
    countryCode: null,
    yield3m: empty(),
    yield6m: empty(),
    yield12m: empty(),
    picks6mAvg: null,
    picks6mTrace: null,
    picksFree3mAvg: null,
    yieldFree3m: null,
    showPeriodRow: false,
  }
}

// DB-backed Bet2Invest row. Misma regla de honestidad: capturedAt siempre
// visible (captura fechada, no sync). El yield es el ROI PUBLICADO por la
// fuente: la página no muestra el total apostado, así que no es una cifra
// recalculada y su base de stake es inferida (la página la contrasta con el
// modo plano 'Profit (1U)'). Las unidades Bet2Invest no son equivalentes a
// € ni a las unidades de Tipstrr o Golazobets. Sin precio (no capturado),
// sin 'since' (semántica de la columna del listado no verificada) y sin
// periodos (sección mensual solo observada vacía): null, nunca 0.
function bet2investFromDbRow(t: Tipster): TipsterCardData {
  const num = (v: string | null): number | null => {
    if (v === null) return null
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  const profit = num(t.profit)
  const captured = t.capturedAt ? new Date(t.capturedAt) : null
  const empty = (): PeriodStatView => ({ valuePct: null, trace: null, complete: true })
  return {
    platform: 'bet2invest',
    name: t.name,
    avatarUrl: t.avatarUrl,
    sourceUrl: `https://bet2invest.com/tipsters/performance-stats/${encodeURIComponent(t.slug)}`,
    sourceLabel: `bet2invest.com/tipsters/performance-stats/${t.slug}`,
    capturedAt: captured && !isNaN(captured.getTime()) ? captured.toISOString().slice(0, 10) : null,
    sinceYear: null,
    sinceTitle: null,
    picks: t.picks,
    profitDisplay: profit !== null ? `${profit >= 0 ? '+' : ''}${fmtEs.format(profit)} u` : null,
    yieldPct: num(t.yield),
    yieldTitle: 'ROI publicado por Bet2Invest (beneficio / total apostado, según su documentación); la página no muestra el total apostado: cifra de la fuente con base de stake inferida, no recalculada. Las unidades Bet2Invest no son equivalentes a € ni a las de Tipstrr o Golazobets',
    verifiedPct: null,
    followers: t.followers,
    isVerified: null,
    isPaid: t.isPaid,
    priceLabel: null, // precio de suscripción no capturado
    priceCurrencySuffix: null,
    resetCount: 0,
    resetTitle: null,
    flagUrl: null,
    countryCode: null,
    yield3m: empty(),
    yield6m: empty(),
    yield12m: empty(),
    picks6mAvg: null,
    picks6mTrace: null,
    picksFree3mAvg: null,
    yieldFree3m: null,
    showPeriodRow: false,
  }
}
