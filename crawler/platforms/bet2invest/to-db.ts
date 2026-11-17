// Bet2Invest -> tipsters: puerta de cierre y mapeo a fila.
//
// PURO: sin fetch ni DB. Nada aquí escribe; aplicarlo (migración + Neon +
// decisión del propietario) sigue cerrado. Patrón alineado con
// tipstrr/to-db.ts y golazobets/to-db.ts.
//
// Qué defiende esta puerta y qué no:
// - La página SSR all-time NO muestra el denominador (total apostado), así
//   que el ROI NO es recomputable desde el registro. `yield` se guarda como
//   la cifra publicada por la fuente, etiquetada con base de stake inferida;
//   la puerta verifica COHERENCIA INTERNA de la página (que el parseo
//   entendió lo mostrado), no el valor del yield.
// - NO se usa el stake implícito (profit/roi) como puerta: con porcentajes
//   redondeados la compatibilidad no demuestra el denominador, y una puerta
//   heurística presentaría como recalculado un yield que no lo es. La
//   compatibilidad observada 2026-11-16 en un perfil queda como evidencia
//   documental en docs/bet2invest-design.md, no como criterio.
// - Cierres verificables sin denominador:
//     resumen: won + halfWon + refunded + halfLost + lost === settledBets (EXACTO)
//     deporte: Σbets por deporte === settledBets (EXACTO)
//     profit:  Σprofit por deporte solapa con el total mostrado dentro del
//              intervalo de redondeo (+-0,005 por cifra a 2 decimales;
//              convención observada 2026-11-16, como en golazobets/to-db.ts)
// - Cuarentena NUNCA escribe: la captura y el motivo se conservan para
//   revisión (import_validation_log en la ruta de import real), y la fila
//   existente conserva sus valores y marcas.
//
// Disciplina de campos (ausente = null, nunca 0; nada se asume):
// - profit en UNIDADES propias: profitUnit='bet2invest-units'. No es
//   equivalente a 'units' (Tipstrr) ni a 'golazobets-units': la ordenación
//   por beneficio agrupa por unidad, nunca mezcla (lib/query.ts).
// - price null: el parser lee el botón literal 'Subscribe · $X/Month' solo si el DOM está hidratado
//   (el HTML de servidor no lo trae); aquí NO se mapea: precio sin validar. Los objetos Stripe del
//   payload Nuxt no se interpretan como precio. priceCurrency queda en su default y no afirma divisa
//   (price null la hace muda).
// - isPaid SOLO con etiqueta explicita coherente en og:title y og:description: 'pro' y 'paid' => true, 'free'
//   => false. 'unknown' (sin etiqueta, o campos que discrepan, o dos clases en un campo) va a
//   cuarentena[tipo-cuenta-desconocido]: no se asume free por defecto. 'paid' dice cuenta de pago; no dice
//   precio, suscripcion ni acceso (price sigue null). Que 'paid' equivalga a 'PRO' no esta verificado.
// - sinceYear null: la columna 'Since' del listado tiene semántica NO
//   verificada (¿alta? ¿primera apuesta?): no se mezcla con el sinceYear BB.
// - yield3m/6m/12m: este mapeo los deja null; offline-import.ts los rellena desde la serie mensual de la API solo
//   cuando la serie reproduce el ROI de cabecera y la ventana no toca el mes del reinicio (si no, null con motivo).
//   picks6mAvg sigue null. Se recalculan en cada captura (mergeBet2InvestUpdate los sustituye aunque sean null).
//   `picks` y `yield` son las cifras de la cabecera/pagina, nunca la suma de meses de la API.
// - followers desde audience del perfil cuando la página lo expone.
import type { TipsterInsert } from '@/db/schema'
import type { Bet2InvestProfile } from './parse'

// Redondeo mostrado: 2 decimales => cada cifra acota el valor real a +-0,005.
export const B2I_ROUND = 0.005

// Procedencia del id numérico de una fila Bet2Invest. La plataforma no
// expone id numérico de origen, así que la clave operativa es
// (platform, slug) y el id es SIEMPRE surrogate: o lo genera la única ruta
// de import real en su transacción (secuencia tipsters_internal_id_seq,
// creada por la migración 0005, que la lectura de catálogo de Neon del 2026-11-17 muestra aplicada), o es un fixture del entorno aislado que debe
// rechazarse antes de cualquier escritura real.
export type Bet2InvestIdSource = 'internal-transactional' | 'isolated-fixture'

export interface Bet2InvestDbMappingOptions {
  id: number
  idSource: Bet2InvestIdSource
  slug: string
  capturedAt: Date
}

export type Bet2InvestDbMapping =
  | { ok: true; insert: TipsterInsert }
  | { ok: false; reason: string }

const cuarentena = (clase: string, motivo: string): Bet2InvestDbMapping => ({
  ok: false,
  reason: `cuarentena[${clase}]: ${motivo}: registro NO persistido, captura y motivo conservados`,
})

export function bet2investProfileToInsert(
  p: Bet2InvestProfile,
  opts: Bet2InvestDbMappingOptions,
): Bet2InvestDbMapping {
  // Tipo de cuenta primero: solo etiqueta explícita ('PRO Tipster' o 'Free
  // Tipster' en og). 'unknown' (ninguna o ambas) no se deja pasar.
  if (p.accountType !== 'pro' && p.accountType !== 'free' && p.accountType !== 'paid') {
    return cuarentena(
      'tipo-cuenta-desconocido',
      `accountType='${p.accountType}': sin etiqueta explícita PRO/Free/Paid coherente en og:title/description; la ausencia de una no prueba la otra`,
    )
  }
  // Solo all-time persiste: otro periodo (o ausencia del grupo de periodo)
  // presentaría cifras parciales como históricas.
  if (p.statsScope !== 'all_time') {
    return cuarentena(
      'periodo-no-all-time',
      `statsScope='${p.statsScope}' (periodo activo: ${p.periodLabel ?? 'sin grupo de periodo'}): solo se persiste el periodo 'All'`,
    )
  }
  // Caso cero-real: perfil sin apuestas con todo a 0 o ausente. No es un
  // ausente maquillado: picks 0 con yield null (ROI sobre 0 apostado no
  // está definido).
  if (p.settledBets === 0) {
    const resultsZero = [
      p.results.won,
      p.results.halfWon,
      p.results.refunded,
      p.results.halfLost,
      p.results.lost,
    ].every((v) => v === null || v === 0)
    if (
      (p.profitUnits === null || p.profitUnits === 0) &&
      (p.roiPct === null || p.roiPct === 0) &&
      resultsZero &&
      p.bySport.length === 0
    ) {
      return {
        ok: true,
        insert: buildInsert(p, opts, 0, p.profitUnits === 0 ? '0.00' : null, null),
      }
    }
    return cuarentena(
      'cero-inconsistente',
      'settledBets=0 pero profit/roi/resumen/desglose no están a 0 o ausentes: la página no es el caso cero-real',
    )
  }
  if (p.settledBets === null || p.profitUnits === null || p.roiPct === null) {
    return cuarentena(
      'stats-ausentes',
      `settledBets/profit/roi ausentes (${String(p.settledBets)}/${String(p.profitUnits)}/${String(p.roiPct)}): ausente=null, no verificable`,
    )
  }
  // Cierre del resumen de resultados: las cinco categorías suman el total.
  const r = p.results
  if (r.won === null || r.halfWon === null || r.refunded === null || r.halfLost === null || r.lost === null) {
    return cuarentena('resumen-incompleto', 'resumen de resultados con categorías ausentes')
  }
  const sumResults = r.won + r.halfWon + r.refunded + r.halfLost + r.lost
  if (sumResults !== p.settledBets) {
    return cuarentena(
      'resumen-no-cierra',
      `won+halfWon+refunded+halfLost+lost (${sumResults}) != settledBets (${p.settledBets})`,
    )
  }
  // Desglose por deporte: sin él no hay cierre cruzado posible.
  if (p.bySport.length === 0) {
    return cuarentena(
      'desglose-ausente',
      'sin tabla de desglose por deporte: el cierre cruzado no es verificable',
    )
  }
  if (p.bySport.some((s) => s.bets === null)) {
    return cuarentena('cierre-deporte-bets', 'desglose con bets ausentes en alguna fila')
  }
  const sumBets = p.bySport.reduce((acc, s) => acc + (s.bets as number), 0)
  if (sumBets !== p.settledBets) {
    return cuarentena(
      'cierre-deporte-bets',
      `Σbets por deporte (${sumBets}) != settledBets (${p.settledBets})`,
    )
  }
  if (p.bySport.some((s) => s.profitUnits === null)) {
    return cuarentena('cierre-deporte-profit', 'desglose con profit ausente en alguna fila')
  }
  const sumProfit = p.bySport.reduce((acc, s) => acc + (s.profitUnits as number), 0)
  const tol = B2I_ROUND * (p.bySport.length + 1) + 1e-9 // +1e-9: a difference of exactly N*0.005 must not fail on float noise (e.g. 23.87-23.86)
  if (Math.abs(sumProfit - p.profitUnits) > tol) {
    return cuarentena(
      'cierre-deporte-profit',
      `Σprofit por deporte (${sumProfit.toFixed(2)}) fuera del intervalo de redondeo del total (${p.profitUnits}±${tol.toFixed(3)})`,
    )
  }
  return {
    ok: true,
    insert: buildInsert(p, opts, p.settledBets, p.profitUnits.toFixed(2), p.roiPct.toFixed(2)),
  }
}

function buildInsert(
  p: Bet2InvestProfile,
  opts: Bet2InvestDbMappingOptions,
  picks: number,
  profit: string | null,
  yieldAll: string | null,
): TipsterInsert {
  return {
    id: opts.id,
    platform: 'bet2invest',
    slug: opts.slug,
    name: p.username,
    avatarUrl: null, // el parser no captura avatar
    flagUrl: null,
    countryCode: null,
    isPaid: p.accountType === 'pro' || p.accountType === 'paid', // 'paid' = etiqueta literal 'Paid Tipster' (title) y 'paid tipster' (description): dice cuenta de pago, NO precio ni acceso; price sigue null; por etiqueta explícita; Free: ver docs/bet2invest-design.md (observación n=2, no un hecho general)
    price: null, // precio sin validar (solo botón hidratado; Stripe del payload no interpretado): no se asume
    profitUnit: 'bet2invest-units',
    priceCurrency: 'eur', // default de esquema; price null la deja muda
    sinceYear: null, // 'Since' del listado: semántica no verificada
    signupAt: null,
    capturedAt: opts.capturedAt,
    picks,
    profit,
    yield: yieldAll, // ROI publicado por la fuente; base de stake inferida
    verifiedPct: null,
    isVerified: false,
    // Free: followers/rating observados (2/1 en ambos perfiles Free vistos) pueden ser
    // marcadores por defecto, no mediciones verificadas: no se persisten (null).
    followers: p.accountType === 'pro' ? p.audience.followers : null, // 'paid': no verificado, null; // null si la página no lo expone
    lastPickAt: null,
    resetCount: 0,
    lastResetAt: null,
    picks6mAvg: null, // sección mensual solo observada vacía
    yield3m: null,
    yield6m: null,
    yield12m: null,
    picksFree3mAvg: null,
    yieldFree3m: null,
    statsUpdatedAt: opts.capturedAt,
  }
}

// Mezcla upsert preserva-ausentes: un valor ausente (null/undefined) en la
// captura nueva NUNCA sobrescribe un valor válido ya guardado; los valores
// presentes sí actualizan. Pura: no toca la DB. Misma política que
// mergeTipstrrUpdate. NO usar directamente: pasar por planBet2InvestUpsert,
// que aplica las guardas de cuarentena y frescura.
const B2I_DERIVED_WINDOW_KEYS = new Set(['yield3m', 'yield6m', 'yield12m', 'picks6mAvg'])

export function mergeBet2InvestUpdate(existing: TipsterInsert, next: TipsterInsert): TipsterInsert {
  const merged: Record<string, unknown> = { ...existing }
  for (const [key, value] of Object.entries(next)) {
    if (key === 'capturedAt' || key === 'statsUpdatedAt' || B2I_DERIVED_WINDOW_KEYS.has(key)) {
      // Frescura validada antes por planBet2InvestUpsert. Los derivados de ventana (yield3m/6m/12m, picks6mAvg) se
      // recalculan en cada captura: un null nuevo (sin datos, reinicio, serie que no cierra) REEMPLAZA al valor viejo,
      // porque conservarlo dejaria un yield de otra ventana presentado como actual.
      merged[key] = value
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

// Decisión de escritura para una captura mapeada. Tres guardas, como en
// planTipstrrUpsert:
// 1. CUARENTENA: un mapeo rechazado NUNCA escribe ni toca la fila existente.
// 2. FRESCURA: una captura más antigua (o igual) que la almacenada no
//    retrocede valores ni marcas.
// 3. Ausentes: delegada en mergeBet2InvestUpdate.
export type Bet2InvestUpsertPlan =
  | { action: 'insert'; insert: TipsterInsert }
  | { action: 'update'; merged: TipsterInsert }
  | { action: 'skip'; reason: string }

export function planBet2InvestUpsert(
  existing: TipsterInsert | null,
  mapping: Bet2InvestDbMapping,
): Bet2InvestUpsertPlan {
  if (!mapping.ok) {
    return {
      action: 'skip',
      reason: `captura en cuarentena (${mapping.reason}): no se escribe nada y la fila existente conserva sus valores y marcas`,
    }
  }
  if (!existing) return { action: 'insert', insert: mapping.insert }
  const nextAt = parseCapturedAt(mapping.insert.capturedAt)
  const curAt = parseCapturedAt(existing.capturedAt)
  if (nextAt === null) {
    return {
      action: 'skip',
      reason: `captura nueva sin capturedAt parseable (${String(mapping.insert.capturedAt)}): no se escribe sin frescura verificable`,
    }
  }
  if (curAt === null) {
    return {
      action: 'skip',
      reason: 'fila existente sin capturedAt: no se puede ordenar la captura; política conservadora, no se sobrescribe',
    }
  }
  if (nextAt <= curAt) {
    return {
      action: 'skip',
      reason: `captura no más reciente que la almacenada (${String(mapping.insert.capturedAt)} <= ${String(existing.capturedAt)}): no se retroceden valores ni marcas`,
    }
  }
  return { action: 'update', merged: mergeBet2InvestUpdate(existing, mapping.insert) }
}

// Fecha de captura ordenable o null. Una cadena inválida produce NaN, que
// se trata como ausente (conservador).
function parseCapturedAt(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const t = v instanceof Date ? v.getTime() : new Date(v as string).getTime()
  return Number.isFinite(t) ? t : null
}

// Guarda de la ruta de import REAL: los ids provisionales del entorno
// aislado (idSource 'isolated-fixture') deben rechazarse ANTES de cualquier
// escritura real. El único origen válido es 'internal-transactional'
// (surrogate de la propia transacción de import). Mismo contrato que
// assertRealImportProvenance de Tipstrr. La invoca el ejecutor transaccional
// local probado; todavía no hay adaptador ni activación de producción.
export function assertBet2InvestRealImportProvenance(idSource: Bet2InvestIdSource, slug: string): void {
  if (idSource === 'isolated-fixture') {
    throw new Error(
      `import real rechazado para ${slug}: idSource '${idSource}' — los ids provisionales del entorno aislado no son payload importable`,
    )
  }
}
