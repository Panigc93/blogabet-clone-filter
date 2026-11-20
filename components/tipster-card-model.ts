import {visibleBEPeriods,type BEVisiblePeriods} from '@/lib/bettingexpert-visible-periods'
import { classifyAccess, verifiedAccessReviewEnabled } from '@/lib/access-classification'
import {beClientEligible,type BEClientAudit} from '@/lib/bettingexpert-period-contract'
import { periodEligible, type AuditedTipster } from '@/lib/bet2invest-period-contract'
import { fromOlbgReadRow, unknownOlbgCard } from './olbg-card-model'
import type { Tipster } from '@/db/schema'
import type { FichaSnapshot } from '@/app/lab/tipstrr/ficha/fixtures'
import { computeExactPeriodStats } from '@/crawler/platforms/tipstrr/periods'

// Platform-agnostic view model for the tipster table row. The existing
// Blogabet path is preserved verbatim (fromDbTipster maps the DB row 1:1);
// Tipstrr rows come from dated real captures (fromTipstrrSnapshot), never
// presented as a sync: capturedAt is always shown.

export type Platform = 'blogabet' | 'tipstrr' | 'golazobets' | 'bet2invest' | 'bettingexpert' | 'olbg' | 'apuestes'

export interface PeriodStatView {
  valuePct: number | null
  trace: string | null // e.g. '+£816.00 beneficio / 320u apostadas · ago 2026 – oct 2026 · 3/3 meses'
  complete: boolean
  detailLabel?: string
  note?: string // compact sample/date/caveats inside existing B2I period cells
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
  profitDisplay: string | null // source units or currency, explicitly distinguished
  yieldPct: number | null
  yieldTitle: string | null // provenance note for the yield figure
  olbgEstimates?: import('./olbg/OlbgEstimatedGlobal').OlbgEstimates
  olbgMonthly?: import('@/lib/olbg-published-monthly').MonthlyDisplay
  sourceDetail?: {summary:string;text:string}
  periodBasisNote?: string // visible source-specific period basis, not a calculation trace
  mainScopeNote?: string // visible sample scope, never an all-time claim
  mainBasisNote?: string // visible profit/yield basis when not conventional
  picksLabel?: string
  profitLabel?: string
  yieldLabel?: string
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

export type TipsterReadRow = Omit<Tipster, 'picks' | 'isPaid' | 'isVerified' | 'resetCount' | 'priceCurrency'> & {
  picks: number | null; isPaid: boolean | null; isVerified: boolean | null
  resetCount: number | null; priceCurrency: string | null; olbgEvidence?: unknown; olbgObserved?: unknown; olbgJoinedAt?: string | null
} & AuditedTipster

export function fromDbTipster(t: TipsterReadRow, now = new Date()): TipsterCardData {
  if (t.platform === 'olbg') return fromOlbgReadRow(t, now) ?? unknownOlbgCard(t.name, t.slug, t.olbgJoinedAt)
  if (t.platform === 'tipstrr') return tipstrrFromDbRow(t)
  if (t.platform === 'golazobets') return golazobetsFromDbRow(t)
  if (t.platform === 'bet2invest') return bet2investFromDbRow(t, now)
  if (t.platform === 'bettingexpert') return bettingexpertFromDbRow(t,now)
  if (t.platform === 'apuestes') return apuestesFromDbRow(t)
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
  // Coherencia tarjeta-filtro (flag VERIFIED_ACCESS_REVIEW): el indicador de
  // pago y el precio siguen la clasificación efectiva, no el booleano del
  // listing. SERVICE FULL (is_paid=false almacenado) muestra el indicador de
  // pago existente sin precio; un blog muerto o sin señal no muestra pago ni
  // precio aunque el listing diga lo contrario; una fila nunca leída conserva
  // la representación legacy. Sin controles ni badges nuevos.
  const storedPriceLabel = t.price !== null ? String(parseFloat(t.price)) : null
  let bbIsPaid = t.isPaid === true
  let bbPriceLabel = storedPriceLabel
  if (verifiedAccessReviewEnabled()) {
    const access = classifyAccess({ platform: 'blogabet', isPaid: t.isPaid, accessClass: t.accessClass, accessObservedAt: t.accessObservedAt })
    bbIsPaid = access === 'paid'
    bbPriceLabel = access === 'paid'
      ? (t.accessObservedAt
          ? (t.accessPrice !== null && t.accessPrice !== undefined ? String(parseFloat(t.accessPrice)) : null)
          : storedPriceLabel)
      : null
  }
  return {
    platform: 'blogabet',
    profitLabel: 'Profit (u.)',
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
    isPaid: bbIsPaid,
    priceLabel: bbPriceLabel,
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
function tipstrrFromDbRow(t: TipsterReadRow): TipsterCardData {
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
    isPaid: t.isPaid === true,
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
// a las unidades de Blogabet, y la ordenación por profit la agrupa aparte
// (lib/query.ts). Campos no expuestos por la plataforma: null, nunca 0.
function golazobetsFromDbRow(t: TipsterReadRow): TipsterCardData {
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
    isPaid: t.isPaid === true,
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
// Since = año de creación del registro B2I (no primera apuesta).
// Periodos sin auditoría confirmada o de otro mes: null, nunca 0.
function bet2investFromDbRow(t: TipsterReadRow, now: Date): TipsterCardData {
  const num = (v: string | null): number | null => {
    if (v === null) return null
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  const profit = num(t.profit)
  const captured = t.capturedAt ? new Date(t.capturedAt) : null
  const empty = (): PeriodStatView => ({ valuePct: null, trace: null, complete: true })
  const period = (n: 3 | 6 | 12): PeriodStatView => {
    const value = n === 3 ? t.yield3m : n === 6 ? t.yield6m : t.yield12m
    if (!t.b2iAudit || t.b2iAudit.slug !== t.slug || !periodEligible(t.capturedAt, t.b2iAudit, n, value, now)) return empty()
    const w = t.b2iAudit.windows[n]
    const range = `${fmtYm(w.from)} - ${fmtYm(w.to)}`
    const sampleCount = `${w.bets} ${w.bets === 1 ? 'apuesta' : 'apuestas'}`
    const sample = `${sampleCount} · ${w.months}/${n} meses con datos`
    const reset = w.caveats.some((c) => c.startsWith('lastReset-null')) ? 'reinicio no confirmado' : 'posterior al reinicio'
    return { valuePct: num(value), complete: w.months === n, trace: `${range} · ${sample} · ${reset}. Mes ausente no equivale a cero.`, note: sampleCount }
  }
  const periods = { yield3m: period(3), yield6m: period(6), yield12m: period(12) }
  return {
    platform: 'bet2invest',
    name: t.name,
    avatarUrl: t.avatarUrl,
    sourceUrl: `https://bet2invest.com/tipsters/performance-stats/${encodeURIComponent(t.slug)}`,
    sourceLabel: `bet2invest.com/tipsters/performance-stats/${t.slug}`,
    capturedAt: captured && !isNaN(captured.getTime()) ? captured.toISOString().slice(0, 10) : null,
    sinceYear: t.sinceYear,
    sinceTitle: 'Año de registro en Bet2Invest; no es la fecha de primera apuesta',
    picks: t.picks,
    profitDisplay: profit !== null ? `${profit >= 0 ? '+' : ''}${fmtEs.format(profit)} u` : null,
    yieldPct: num(t.yield),
    yieldTitle: 'ROI publicado por Bet2Invest (beneficio / total apostado, según su documentación); la página no muestra el total apostado: cifra de la fuente con base de stake inferida, no recalculada. Las unidades Bet2Invest no son equivalentes a € ni a las de Tipstrr o Golazobets',
    verifiedPct: null,
    followers: t.followers,
    isVerified: null,
    isPaid: t.isPaid === true,
    priceLabel: null, // precio de suscripción no capturado
    priceCurrencySuffix: null,
    resetCount: 0,
    resetTitle: null,
    flagUrl: null,
    countryCode: null,
    ...periods,
    picks6mAvg: null,
    picks6mTrace: null,
    picksFree3mAvg: null,
    yieldFree3m: null,
    showPeriodRow: Object.values(periods).some((p) => p.valuePct !== null),
  }
}

// Profile-overall capture only: stale/accidental period columns never leak.
function bettingexpertFromDbRow(t: TipsterReadRow,now:Date): TipsterCardData {
  const research=(t as TipsterReadRow & {beResearch?:BEVisiblePeriods}).beResearch
  if(visibleBEPeriods(research,t.slug))return bettingexpertResearchCard(t,research)
  const a=(t as TipsterReadRow & {beAudit?:BEClientAudit}).beAudit
  const valid=beClientEligible(a,t.slug,t.capturedAt,now)
  const period=(n:3|6|12):PeriodStatView=>{const w=valid?a!.windows[n]:null;return {valuePct:w?.value!=null?Number(w.value):null,complete:w?.value!=null,trace:w?.value!=null?`Reconstrucción por fecha de publicación · ${w.picks} apuestas cerradas · ${w.from} a ${w.to} UTC · beneficio neto ${w.profit} u Bettingexpert / stake aconsejado ${w.stake} u Bettingexpert × 100. Recuento y beneficio conciliados con anclas capturadas; no yield mensual nativo ni contabilidad de competición. Captura periodos ${a!.periodCapturedAt}`:null}}
  const periods={yield3m:period(3),yield6m:period(6),yield12m:period(12)}
  const base = golazobetsFromDbRow(t)
  const profit = t.profit === null ? null : Number(t.profit)
  return {
    ...base, platform: 'bettingexpert',
    periodBasisNote: valid ? `Reconstrucción por publicación · meses cerrados UTC hasta ${a!.windows[3].to} · yield sobre stake aconsejado. No es el resultado mensual de competición.` : undefined,
    sourceUrl: `https://www.bettingexpert.com/user/profile/${encodeURIComponent(t.slug)}`,
    sourceLabel: `bettingexpert.com/user/profile/${t.slug}`,
    profitDisplay: profit !== null && Number.isFinite(profit) ? `${profit >= 0 ? '+' : ''}${new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(profit)}` : null,
    yieldTitle: 'Yield global publicado en Overall stats de Bettingexpert; no es el ranking por deporte ni un periodo 3/6/12m. Beneficio en unidades de stake, no euros. La unidad no fija capital ni riesgo equivalentes entre tipsters.',
    sinceYear: null, sinceTitle: 'Fecha de alta no disponible en los datos verificados de Bettingexpert. No se sustituye por la primera apuesta ni por la captura.', profitLabel: 'Beneficio (u.)', mainBasisNote: 'Unidades de stake, no euros. El total depende del volumen y los stakes; comparar yield y apuestas del mismo periodo.', isPaid: false,
    ...periods,picks6mAvg:valid&&a!.windows[6].value!==null?a!.windows[6].picks!/6:null,picks6mTrace:valid&&a!.windows[6].value!==null?`${a!.windows[6].picks} apuestas cerradas / 6 meses completos UTC (${a!.windows[6].from} a ${a!.windows[6].to}); media mensual, redondeada al entero. No son meses positivos.`:null,showPeriodRow:Object.values(periods).some(w=>w.valuePct!==null),
  }
}

function bettingexpertResearchCard(t:TipsterReadRow,a:BEVisiblePeriods):TipsterCardData {
  const base=golazobetsFromDbRow(t)
  const period=(n:'3m'|'6m'|'12m'):PeriodStatView=>{
    const w=a.windows[n],numeric=w.state==='number'
    const label=w.quality==='experimental'?'Experimental':w.quality==='contrasted'?'Contrastado':'Calculado'
    const basis=w.quality==='contrasted'?'Recuento y beneficio contrastados con los límites de la fuente.':w.quality==='experimental'?'Contraste experimental, separado de las cifras contrastadas.':w.quality==='global-consistent'?'Historial consistente con el total Global, no con un total independiente del período.':'Historial observado, sin total independiente del período para contrastarlo.'
    return {valuePct:numeric?Number(w.value):null,complete:numeric,detailLabel:numeric?label:'Sin dato',
      trace:numeric?`${fmtYm(w.from)} a ${fmtYm(w.to)} · ${w.picks} apuestas observadas, por fecha de publicación. Yield sobre stake aconsejado. ${basis} Las liquidaciones pueden haber cambiado después del cierre.`:w.state==='held'?'Pendiente de validar cobertura, estado o aritmética. No equivale a cero.':'Sin muestra elegible observada. No equivale a rentabilidad cero.'}
  }
  const profit=t.profit===null?null:Number(t.profit)
  return {...base,platform:'bettingexpert',sourceUrl:`https://www.bettingexpert.com/user/profile/${encodeURIComponent(t.slug)}`,sourceLabel:'bettingexpert.com',
    sinceYear:null,sinceTitle:'Fecha de alta no comprobada',isVerified:null,followers:null,isPaid:false,
    profitDisplay:profit!==null&&Number.isFinite(profit)?new Intl.NumberFormat('de-DE',{minimumFractionDigits:2,maximumFractionDigits:3,signDisplay:'exceptZero'}).format(profit):null,
    profitLabel:'Beneficio (u.)',yieldTitle:'Global publicado por Bettingexpert, separado de los períodos calculados. Unidades de stake, no euros.',
    capturedAt:null,mainBasisNote:undefined,yieldLabel:'Yield Global',
    sourceDetail:{summary:'Datos de fuente',text:`Global publicado por Bettingexpert, capturado ${t.capturedAt?new Date(t.capturedAt).toISOString().slice(0,10):'en fecha no confirmada'}. Unidades de stake propias, no euros. No es una actualización en tiempo real.`},
    yield3m:period('3m'),yield6m:period('6m'),yield12m:period('12m'),
    picks6mAvg:null,
    picks6mTrace:'Apuestas elegibles del período 6m / 6 meses calendario. No son meses positivos.',showPeriodRow:true}
}

// DB-backed Apuestes row. Units discipline: profit in Apuestes units ('u'),
// never euros; the on-site EUR figure is the subscription price, whose plan
// semantics could not be verified from the capture, so price stays unshown.
// Per Juan's call (2026-11-20) the card adds NO capture/provenance text to
// the UI: capturedAt stays null here; provenance lives in the DB columns
// (captured_at, stats_updated_at, source_portfolio_id, source_url).
// The profile link uses the exact stored source_url (listing evidence);
// reconstruction from name/slug was dropped: 761 usernames are not URL-safe.
function apuestesFromDbRow(t: TipsterReadRow): TipsterCardData {
  const num = (v: string | null): number | null => {
    if (v === null) return null
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  const profit = num(t.profit)
  const period = (v: string | null): PeriodStatView => ({ valuePct: num(v), trace: null, complete: true })
  const profile = t.sourceUrl ?? 'https://apuestes.com/tipsters'
  return {
    platform: 'apuestes',
    name: t.name,
    avatarUrl: t.avatarUrl,
    sourceUrl: profile,
    sourceLabel: profile.replace('https://', ''),
    capturedAt: null, // UI limpia: sin texto de captura en la tarjeta
    sinceYear: t.sinceYear,
    sinceTitle: 'Primer mes con picks registrados en la captura de Apuestes; no es fecha de alta',
    picks: t.picks,
    profitDisplay: profit !== null ? `${profit >= 0 ? '+' : ''}${Math.round(profit)} u` : null,
    yieldPct: num(t.yield),
    yieldTitle: 'Yield publicado por Apuestes (beneficio / unidades apostadas); las unidades Apuestes no son equivalentes a € ni a las de otras plataformas',
    verifiedPct: null, // no expuesto por Apuestes
    followers: t.followers,
    isVerified: null, // concepto no expuesto: sin badge
    isPaid: t.isPaid === true,
    priceLabel: null, // semantica de planes no verificada desde la captura
    priceCurrencySuffix: null,
    resetCount: 0,
    resetTitle: 'Apuestes no expone resets de estadisticas',
    flagUrl: null,
    countryCode: null,
    yield3m: period(t.yield3m),
    yield6m: period(t.yield6m),
    yield12m: period(t.yield12m),
    picks6mAvg: num(t.picks6mAvg),
    picks6mTrace: null,
    picksFree3mAvg: null,
    yieldFree3m: null,
    showPeriodRow: t.yield6m != null || t.yield12m != null || t.picks6mAvg != null,
  }
}
