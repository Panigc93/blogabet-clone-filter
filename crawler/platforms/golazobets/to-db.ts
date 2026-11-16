// Golazobets -> tipsters: puerta de cierre y mapeo a fila.
//
// PURO: sin fetch ni DB. El script scripts/import-golazobets-catalog.ts
// orquesta; los tests cubren la puerta con capturas reales y bordes sinteticos
// (los sinteticos viven SOLO en tests, nunca en captures/ ni en produccion).
//
// Semantica de unidades fuente (medida en capturas 2026-11-15):
// - profit/total_bet: UNIDADES de stake (no moneda). yield = 100*profit/total_bet
//   (verificado: KROM90 55,63/132 = 42,14% exacto en cabecera y mensual).
// - header = agregado all-time del perfil (tipster_stats); monthly = filas
//   {year, month, ...} all-time del propio perfil (componente TipsterProfile).
// - Los valores mensuales vienen redondeados a 2 decimales por la plataforma;
//   la cabecera parece calcularse sin ese redondeo intermedio.
//
// Puerta de cierre (bajo el supuesto documentado de redondeo mensual a 2
// decimales; las diferencias medidas se conservan y los candidatos limite
// quedan listados para revision independiente en docs/golazobets-import.md):
//   picks:  sum(monthly.total_picks) === header.number_bets      (EXACTO)
//   profit: |sum(monthly.profit) - header.profit|
//             < 0,005 * n_meses + 0,01                            (cota de redondeo)
//   yield:  |100*sum(profit)/sum(total_bet) - header.yield|
//             < 0,06 + 100 * tol_profit / sum(total_bet)          (cota escalada por volumen)
// Cualquier dato ausente es null (nunca 0) y lleva a cuarentena con clase.
import type { TipsterInsert } from '@/db/schema'

export interface GzbProfileCapture {
  tipster_id: number | null
  type: string | null
  sport_id: number | null
  header: {
    number_bets: number | null
    total_bet: number | null
    profit: number | null
    yield: number | null
    win_rate: number | null
    average_stake: number | null
    average_odds: number | null
  }
  monthly: {
    year: number | null
    month: number | null
    total_picks: number | null
    total_bet: number | null
    profit: number | null
    yield: number | null
    win_rate: number | null
    average_stake: number | null
    average_odds: number | null
  }[]
  picks_total: number | null
  recent_results: string[] | null
}

export type GzbGateResult =
  | { ok: true; diffs: { picks: number; profit: number; yield: number; months: number } }
  | { ok: false; clase: string; razon: string }

export const GZB_PROFIT_TOL = (months: number): number => 0.005 * Math.max(1, months) + 0.01
export const GZB_YIELD_TOL = (totalBet: number, months: number): number =>
  0.06 + (100 * GZB_PROFIT_TOL(months)) / Math.max(totalBet, 0.01)

export function golazobetsClosureGate(cap: GzbProfileCapture): GzbGateResult {
  if (cap.type !== 'free' && cap.type !== 'premium') {
    return { ok: false, clase: 'cuarentena[tipo-desconocido]', razon: `type=${String(cap.type)} no documentado (free|premium): no se asume free por defecto` }
  }
  const h = cap.header
  if (h.number_bets === null || h.profit === null || h.yield === null || h.total_bet === null) {
    return { ok: false, clase: 'cuarentena[stats-ausentes]', razon: 'cabecera sin number_bets/total_bet/profit/yield: ausente=null, no verificable' }
  }
  if (!Array.isArray(cap.monthly) || cap.monthly.length === 0) {
    return { ok: false, clase: 'cuarentena[datos-mensuales-ausentes]', razon: 'sin filas mensuales: el cierre no es verificable' }
  }
  let sumPicks = 0
  let sumProfit = 0
  let sumBet = 0
  for (const m of cap.monthly) {
    if (m.total_picks === null || m.profit === null || m.total_bet === null || m.year === null || m.month === null) {
      return { ok: false, clase: 'cuarentena[datos-mensuales-ausentes]', razon: 'fila mensual con campos null: ausente=null, cierre no computable' }
    }
    sumPicks += m.total_picks
    sumProfit += m.profit
    sumBet += m.total_bet
  }
  const dPicks = sumPicks - h.number_bets
  if (dPicks !== 0) {
    return { ok: false, clase: 'cuarentena[cierre-picks]', razon: `suma mensual picks ${sumPicks} != cabecera ${h.number_bets} (exacto exigido)` }
  }
  const dProfit = Math.abs(sumProfit - h.profit)
  const tolP = GZB_PROFIT_TOL(cap.monthly.length)
  if (dProfit >= tolP) {
    return { ok: false, clase: 'cuarentena[cierre-profit]', razon: `|sum profit ${sumProfit.toFixed(2)} - cabecera ${h.profit}| = ${dProfit.toFixed(3)} >= cota ${tolP.toFixed(3)} (${cap.monthly.length} meses)` }
  }
  if (sumBet <= 0) {
    return { ok: false, clase: 'cuarentena[volumen-cero]', razon: 'suma total_bet <= 0: yield no derivable' }
  }
  const derivedYield = (100 * sumProfit) / sumBet
  const dYield = Math.abs(derivedYield - h.yield)
  const tolY = GZB_YIELD_TOL(sumBet, cap.monthly.length)
  if (dYield >= tolY) {
    return { ok: false, clase: 'cuarentena[cierre-yield]', razon: `|yield derivado ${derivedYield.toFixed(2)} - cabecera ${h.yield}| = ${dYield.toFixed(3)} >= cota ${tolY.toFixed(3)}` }
  }
  return { ok: true, diffs: { picks: dPicks, profit: sumProfit - h.profit, yield: derivedYield - h.yield, months: cap.monthly.length } }
}

export type GzbDbMapping = { ok: true; insert: TipsterInsert } | { ok: false; reason: string }

// Mapeo a fila. SOLO tras la puerta ok. Campos no expuestos por Golazobets:
// null (verifiedPct, followers, sinceYear, lastPickAt, signupAt, precios).
export function golazobetsCaptureToInsert(
  slug: string,
  cap: GzbProfileCapture,
  opts: { capturedAt: string },
): GzbDbMapping {
  const gate = golazobetsClosureGate(cap)
  if (!gate.ok) return { ok: false, reason: `${gate.clase}: ${gate.razon}` }
  const h = cap.header
  return {
    ok: true,
    insert: {
      id: -1, // placeholder: la secuencia interna asigna el real en el INSERT
      platform: 'golazobets',
      slug,
      name: slug, // la plataforma expone el username como nombre publico
      // Etiqueta propia: las unidades Golazobets NO son equivalentes a las
      // 'units' de Tipstrr ni a 'eur' de Blogabet (semantica de stake
      // distinta; revision 2026-11-16). Etiqueta separada para que ninguna
      // comparacion/ordenacion por profit las mezcle silenciosamente.
      profitUnit: 'golazobets-units',
      // priceCurrency omitido: price es null (precio premium no expuesto);
      // el default de esquema se ignora mientras price sea null.
      avatarUrl: null,
      flagUrl: null,
      countryCode: null,
      isPaid: cap.type === 'premium',
      price: null,
      sinceYear: null,
      picks: h.number_bets,
      profit: h.profit !== null ? String(h.profit) : null,
      yield: h.yield !== null ? String(h.yield) : null,
      verifiedPct: null, // win_rate != % verificado: no se mezclan conceptos
      isVerified: false,
      followers: null,
      lastPickAt: null, // granularidad mensual no es fecha de pick
      signupAt: null, // no capturado (la pagina no lo expone en lo medido)
      capturedAt: new Date(opts.capturedAt),
      resetCount: 0,
      lastResetAt: null,
      picks6mAvg: null,
      yield3m: null,
      yield6m: null,
      yield12m: null,
      picksFree3mAvg: null,
      yieldFree3m: null,
      statsUpdatedAt: new Date(opts.capturedAt),
      sourcePortfolioId: cap.tipster_id,
    } as TipsterInsert,
  }
}
