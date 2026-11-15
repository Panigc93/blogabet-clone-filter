// Maps a loaded Tipstrr capture (FichaSnapshot from load-capture.ts) to a
// tipsters-table insert record. Pure: performs no DB write. Applying it is
// gated (migration + Neon + owner decision).
//
// Unit discipline:
// - profit is stored in Tipstrr UNITS with profitUnit='units' (never
//   converted to money; the EUR display is a view concern, x account stake).
// - price is the subscription price in GBP with priceCurrency='gbp'.
// - yield columns are unitless percentages. The all-time `yield` is stored
//   ONLY when every consistency check of this snapshot passes (roi =
//   profit/total staked verified on this record); otherwise null — never a
//   number we cannot defend. Period yields come from the source's exact
//   monthly figures (computeExactPeriodStats); incomplete windows are null.
// - Fields Tipstrr does not expose stay null (verifiedPct, followers,
//   resetCount stays 0 = "none exposed", sinceYear null in favor of
//   signupAt, lastPickAt null: month granularity is not a pick date).

import type { FichaSnapshot } from '@/app/lab/tipstrr/ficha/fixtures'
import type { TipsterInsert } from '@/db/schema'
import { computeExactPeriodStats } from './periods'

export interface TipstrrDbMappingOptions {
  // tipsters.id is the source-provided PK (BB supplies its own numeric id).
  // Convention: Tipstrr rows use -portfolioId, so the two id spaces never
  // collide. portfolioId comes from the source's own data (e.g. captured
  // per-tip objects); never invent one.
  id: number
  slug: string
  subscriptionPriceGbp?: number | null // e.g. 39; null when unknown/free
  isPaid: boolean
}

export type TipstrrDbMapping =
  | { ok: true; insert: TipsterInsert }
  | { ok: false; reason: string }

export function tipstrrSnapshotToInsert(
  s: FichaSnapshot,
  opts: TipstrrDbMappingOptions
): TipstrrDbMapping {
  // Requisito 2026-11-15: el total histórico de picks es el dato del filtro
  // "nº de picks" y la columna es NOT NULL, así que un total ausente o no
  // verificable RECHAZA el registro con motivo explícito (la captura se
  // conserva para revisión); nunca se fabrica un 0. Un 0 REAL (perfil
  // nuevo sin tips) sí se persiste como 0.
  //
  // Alcance del overview (hallazgo 2026-11-15, 209 capturas): el overview
  // del estado /stats viene acotado al periodo seleccionado (3/4/5 =
  // ventanas rodantes no reproducibles desde buckets mensuales; 6 =
  // all-time). Por tanto el total histórico se resuelve por niveles:
  //   VERIFICADO: overview all-time (period 6 o tips == suma de la serie)
  //     con TODAS las comprobaciones en verde -> picks = overview.tips,
  //     yield = roi del overview (cierra contra denominadores exactos).
  //   COBERTURA: overview rodante/no verificable pero la serie mensual
  //     llega al mes de alta -> picks = suma exacta de la serie (los meses
  //     sin actividad no tienen fila y aportan 0: no corrompen la suma;
  //     la ausencia de truncamiento está probada por los 44 cierres
  //     exactos period=6 y series de 184 filas), yield all-time =
  //     Σprofit/Σstaked de la serie (misma fórmula que los yields de
  //     periodo ya aprobados), null si Σstaked = 0.
  //   CONTRADICCION: overview all-time que NO cierra contra la serie ->
  //     si hay cobertura se conserva picks = suma pero yield = null (los
  //     datos se contradicen a nivel de unidad; no defendemos ninguno).
  //   RECHAZO: sin serie y sin total, o serie que empieza después del mes
  //     de alta (posible truncamiento o primera actividad tardía: silencio
  //     ambiguo), o total ausente en un overview all-time consistente.
  // Política para la futura vía de actualización: una captura con un dato
  // ausente nunca sobrescribe con null un valor ya guardado válido.
  const sumTips = s.monthState.reduce((acc, m) => acc + m.tips, 0)
  const sumStaked = s.monthState.reduce((acc, m) => acc + m.staked, 0)
  const sumProfit = s.monthState.reduce((acc, m) => acc + m.profit, 0)
  const firstMonth = s.monthState.length
    ? s.monthState.reduce((a, b) => (a.year * 12 + a.month <= b.year * 12 + b.month ? a : b))
    : null
  const signupYm = s.signupDate ? s.signupDate.slice(0, 7) : null
  const coverage =
    firstMonth !== null &&
    signupYm !== null &&
    `${firstMonth.year}-${String(firstMonth.month).padStart(2, '0')}` <= signupYm
  const overviewAllTime =
    s.overviewPeriod === 6 || (s.overview.tips !== null && s.overview.tips === sumTips)
  const allConsistent = s.consistency.length > 0 && s.consistency.every((c) => c.passed)

  let picks: number
  let yieldAll: string | null
  const verified =
    overviewAllTime &&
    allConsistent &&
    (s.monthState.length === 0 || s.overview.tips === sumTips)
  if (verified) {
    if (s.overview.tips === null || s.overview.tips === undefined) {
      return {
        ok: false,
        reason:
          'falta el total histórico de picks (overview.tips ausente en overview all-time consistente): registro omitido, captura conservada para revisión',
      }
    }
    picks = s.overview.tips
    yieldAll = s.overview.roiPct !== null ? s.overview.roiPct.toFixed(2) : null
  } else if (s.monthState.length === 0 && s.overview.tips === 0) {
    picks = 0 // 0 real: perfil sin tips; no un ausente maquillado
    yieldAll = null
  } else if (coverage) {
    picks = sumTips
    // Contradicción overview/serie: no defendemos ningún yield. Si no hay
    // contradicción (overview rodante), el yield all-time se calcula de
    // las cifras mensuales exactas de la fuente.
    yieldAll = overviewAllTime
      ? null
      : sumStaked > 0
        ? (Math.round((sumProfit / sumStaked) * 10000) / 100).toFixed(2)
        : null
  } else {
    return {
      ok: false,
      reason:
        'total histórico de picks no verificable: la serie mensual no llega al mes de alta (posible truncamiento o silencio ambiguo) y el overview no es all-time: registro omitido, captura conservada para revisión',
    }
  }
  const periods = computeExactPeriodStats(s.monthState, new Date(s.capturedAtDate))

  const periodOrNull = (p: { yieldPct: number; complete: boolean } | null): string | null =>
    p && p.complete ? p.yieldPct.toFixed(2) : null

  return { ok: true, insert: {
    id: opts.id,
    platform: 'tipstrr',
    slug: opts.slug,
    name: s.name,
    avatarUrl: s.avatarUrl,
    flagUrl: null,
    countryCode: null,
    isPaid: opts.isPaid,
    price: opts.subscriptionPriceGbp != null ? opts.subscriptionPriceGbp.toFixed(2) : null,
    profitUnit: 'units',
    priceCurrency: 'gbp',
    sinceYear: null,
    signupAt: s.signupDate ? new Date(`${s.signupDate}T00:00:00Z`) : null,
    capturedAt: new Date(s.capturedAtDate),
    picks,
    profit: s.monthState.length > 0 ? sumProfit.toFixed(3) : null,
    yield: yieldAll,
    verifiedPct: null,
    isVerified: false,
    followers: null,
    lastPickAt: null, // month granularity only; not a pick date
    resetCount: 0,
    lastResetAt: null,
    // Misma política que la ficha del laboratorio: la media de picks/mes
    // solo se guarda si la ventana de 6 meses cerrados está completa; con
    // ventana incompleta sería una media sobre menos meses aparentando 6.
    picks6mAvg: periods.yield6m !== null && periods.yield6m.complete && periods.picks6mAvg !== null
      ? periods.picks6mAvg.toFixed(2)
      : null,
    yield3m: periodOrNull(periods.yield3m),
    yield6m: periodOrNull(periods.yield6m),
    yield12m: periodOrNull(periods.yield12m),
    picksFree3mAvg: null, // free/paid monthly split: not evaluable (2026-11-15)
    yieldFree3m: null,
    statsUpdatedAt: new Date(s.capturedAtDate),
  } }
}
