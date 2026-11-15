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
  // Procedencia del id, declarada por el llamador: 'source-captured' =
  // portfolioId real del origen (único importable); 'isolated-fixture' =
  // provisional para entorno aislado, NUNCA payload de producción.
  idSource: 'source-captured' | 'isolated-fixture'
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
  // PUERTA ESTRICTA (2026-11-15): el histórico
  // solo se persiste con CIERRE ALL-TIME INDEPENDIENTE verificable y base
  // aconsejada confirmada. Lo que dependa de completitud INFERIDA de la
  // serie va a CUARENTENA (no se persiste; captura y motivo conservados).
  // No se fabrican datos: es criterio de calidad.
  //
  //   PERSISTE: overview all-time (period 6, o tips == suma de la serie
  //     cuando la ventana cubre toda la vida del perfil) Y tres cierres
  //     numéricos contra la serie: tips == Σtips, roi aconsejado ==
  //     Σprofit/Σstaked (±0.05) y profit aconsejado == Σprofit (±0.01).
  //     Los huecos de meses sin actividad NO excluyen: el total queda
  //     confirmado por el cierre independiente (verificado sobre las
  //     capturas: 20 de 43 cierres period=6 tienen huecos y cierran).
  //     Una ventana rodante solo vale como all-time por igualdad si
  //     periodStartDate <= fecha de alta EXACTA (sin tolerancia): si la
  //     ventana empieza después del alta, la igualdad tips == suma no
  //     confirma el total histórico. Entonces
  //     picks = overview.tips (== suma, verificado) y yield = roi del
  //     overview, base ACONSEJADA — evidencia 15-11-2026: Σprofit/Σstaked
  //     cierra contra overview.roi en 41 perfiles y contra levelStakeROI
  //     en 0; 150/208 con Σstaked ≠ Σtips descartan base level.
  //     advised != level NO invalida: es estructural en stake variable.
  //   CERO REAL: overview all-time con tips = 0 y serie vacía → picks 0,
  //     yield null.
  //   CUARENTENA (clases de motivo separadas):
  //     - 'contradiccion-numerica': overview all-time pero alguno de los
  //       tres cierres falla (tips/roi/profit vs serie).
  //     - 'cobertura-sin-cierre': overview no all-time — el total sería la
  //       suma de una serie de completitud inferida (0 filas tips=0 no
  //       prueba omisión de meses inactivos; 67 perfiles/862 meses
  //       ausentes; joydi/nieder/trust-me discrepan incluso en period=6).
  //     - 'ventana-posterior-alta': ventana rodante con tips == suma pero
  //       periodStartDate posterior al alta (o ausente): la igualdad no es
  //       cierre independiente del histórico.
  const sumTips = s.monthState.reduce((acc, m) => acc + m.tips, 0)
  const sumStaked = s.monthState.reduce((acc, m) => acc + m.staked, 0)
  const sumProfit = s.monthState.reduce((acc, m) => acc + m.profit, 0)
  const equalityWindow =
    s.overviewPeriod !== 6 && s.overview.tips !== null && s.overview.tips === sumTips
  // Ventana rodante aceptada como all-time solo si su inicio es <= la fecha
  // de alta exacta. periodStartDate ausente o posterior al alta => la
  // igualdad tips == suma no es un cierre independiente del histórico.
  const windowCoversSinceSignup =
    equalityWindow &&
    typeof s.overview.periodStartDate === 'string' &&
    s.signupDate !== '' &&
    s.overview.periodStartDate.slice(0, 10) <= s.signupDate
  const overviewAllTime = s.overviewPeriod === 6 || windowCoversSinceSignup
  const tipsClose = s.overview.tips !== null && s.overview.tips === sumTips
  const roiCloses =
    sumStaked > 0 &&
    s.overview.roiPct !== null &&
    Math.abs((sumProfit / sumStaked) * 100 - s.overview.roiPct) < 0.05
  const profitCloses =
    s.overview.profitUnits !== null &&
    s.overview.profitUnits !== undefined &&
    Math.abs(sumProfit - s.overview.profitUnits) < 0.01

  let picks: number
  let yieldAll: string | null
  if (s.overview.tips === null || s.overview.tips === undefined) {
    // Sin total no hay ni siquiera candidato a verificar: clase propia.
    return {
      ok: false,
      reason:
        'cuarentena[total-ausente]: overview sin total de picks (tips ausente): registro NO persistido, captura y motivo conservados',
    }
  }
  if (overviewAllTime && tipsClose && roiCloses && profitCloses) {
    picks = s.overview.tips as number // !== null garantizado por tipsClose
    yieldAll = (s.overview.roiPct as number).toFixed(2) // !== null por roiCloses
  } else if (overviewAllTime && s.overview.tips === 0 && s.monthState.length === 0) {
    picks = 0 // 0 real: perfil sin tips; no un ausente maquillado
    yieldAll = null
  } else if (overviewAllTime) {
    return {
      ok: false,
      reason:
        'cuarentena[contradiccion-numerica]: overview all-time sin cierre contra la serie (tips/roi/profit): registro NO persistido, captura y motivo conservados',
    }
  } else if (equalityWindow) {
    return {
      ok: false,
      reason:
        'cuarentena[ventana-posterior-alta]: la ventana del overview empieza después de la fecha de alta (periodStartDate > alta o ausente): la igualdad tips == suma no confirma el total histórico: registro NO persistido, captura y motivo conservados',
    }
  } else {
    return {
      ok: false,
      reason:
        'cuarentena[cobertura-sin-cierre]: overview no all-time; el total histórico dependería de completitud inferida de la serie: registro NO persistido, captura y motivo conservados',
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

// Mezcla upsert preserva-ausentes: un valor ausente (null/undefined) en la
// captura nueva NUNCA sobrescribe un valor válido ya guardado; los valores
// presentes sí actualizan. Pura: no toca la DB. Política requerida para la
// futura vía de actualización (regresión en tests/crawler/tipstrr-to-db.test.ts).
// NO usar directamente: pasar por planTipstrrUpsert, que aplica las guardas
// de frescura y cuarentena.
export function mergeTipstrrUpdate(existing: TipsterInsert, next: TipsterInsert): TipsterInsert {
  const merged: Record<string, unknown> = { ...existing }
  for (const [key, value] of Object.entries(next)) {
    if (key === 'capturedAt' || key === 'statsUpdatedAt') {
      merged[key] = value // la frescura la valida planTipstrrUpsert antes
    } else if (value !== null && value !== undefined) {
      merged[key] = value
    }
  }
  // Identidad inmutable: nunca la toma la captura nueva.
  merged.id = existing.id
  merged.platform = existing.platform
  merged.slug = existing.slug
  return merged as TipsterInsert
}

// Decisión de escritura para una captura mapeada. Tres guardas:
// 1. CUARENTENA: un mapeo rechazado NUNCA escribe. En particular no toca la
//    fila existente: un yield viejo no puede parecer fresco porque la
//    captura nueva tenga capturedAt reciente — la fila conserva sus marcas
//    y la captura/motivo quedan para revisión fuera de la tabla.
// 2. FRESCURA: una captura más antigua (o igual) que la almacenada no
//    retrocede valores ni marcas: no hay nada nuevo que aplicar.
// 3. Ausentes: delegada en mergeTipstrrUpdate (un ausente nunca pisa un
//    valor válido; la identidad es inmutable).
export type TipstrrUpsertPlan =
  | { action: 'insert'; insert: TipsterInsert }
  | { action: 'update'; merged: TipsterInsert }
  | { action: 'skip'; reason: string }

export function planTipstrrUpsert(
  existing: TipsterInsert | null,
  mapping: TipstrrDbMapping
): TipstrrUpsertPlan {
  if (!mapping.ok) {
    return {
      action: 'skip',
      reason: `captura en cuarentena (${mapping.reason}): no se escribe nada y la fila existente conserva sus valores y marcas`,
    }
  }
  if (!existing) return { action: 'insert', insert: mapping.insert }
  const nextAt = mapping.insert.capturedAt ? new Date(mapping.insert.capturedAt).getTime() : null
  const curAt = existing.capturedAt ? new Date(existing.capturedAt).getTime() : null
  if (nextAt !== null && curAt !== null && nextAt <= curAt) {
    return {
      action: 'skip',
      reason: `captura no más reciente que la almacenada (${mapping.insert.capturedAt} <= ${existing.capturedAt}): no se retroceden valores ni marcas`,
    }
  }
  return { action: 'update', merged: mergeTipstrrUpdate(existing, mapping.insert) }
}

// Guarda de la ruta de import REAL: los ids provisionales del entorno
// aislado (-900000-i, idSource 'isolated-fixture') son fixtures de
// validación y deben rechazarse ANTES de cualquier escritura real, no solo
// etiquetarse. La ruta real debe llamar a esta guarda con el idSource
// declarado por el llamador; el seed aislado NO la llama (su entorno es el
// fixture). Con la clave natural (platform, slug) como identidad operativa,
// el id numérico es un surrogate interno transaccional: ningún id de
// fixture puede llegar a producción por esta vía.
export function assertRealImportProvenance(idSource: 'source-captured' | 'isolated-fixture', slug: string): void {
  if (idSource !== 'source-captured') {
    throw new Error(
      `import real rechazado para ${slug}: idSource '${idSource}' — los ids provisionales del entorno aislado no son payload importable`
    )
  }
}
