// Puntuacion MYS: ranking compuesto y transparente para el Top MYS.
// No certifica rendimiento futuro: es una heuristica documentada sobre los
// datos que el crawler guarda en Neon. Misma formula que la lista "Top 50"
// entregada el 30 oct 2026; la referencia de muestra es fija (10.000 picks)
// para que la puntuacion sea estable entre consultas.
//
// Pesos: yield historico 20% (tope 30), yield 6m 20%, yield 3m 10%,
// muestra (log picks) 15%, volumen picks/mes 15% (tope 25),
// % picks verificados 10%, recencia del ultimo avistamiento 10%.
// OJO: last_pick_at NO es la fecha real del ultimo pick. El crawler diario la
// fija a la hora de la corrida cuando el tipster aparece en el listado de
// activos del mes (LAST_ACTIVE<=1) y COALESCE la conserva entre corridas
// (ver ARCHITECTURE.md). Es un proxy de "visto activo por ultima vez".
// Penalizacion: x0,85 por reset de estadisticas (max 4).
// Yields recientes con < 30 picks en 6 meses puntuan neutros (0,30):
// una muestra minuscula no puede inflar a nadie.

export const MYS_MIN_PICKS = 100
export const MYS_MIN_YIELD = 11
export const MYS_ACTIVITY_MONTHS = 3
export const MYS_TOP_N = 50

const MAX_YIELD_REF = 30
const MAX_VOL_REF = 25
const MAX_PICKS_REF = 10000
const RECENT_SAMPLE_MIN = 30 // picks en la ventana de 6m para fiar del yield reciente
const NEUTRAL = 0.3
const RESET_FACTOR = 0.85
const RECENCY_DAYS = 90

export interface MysScoreInput {
  yield: string | null
  yield3m: string | null
  yield6m: string | null
  picks: number
  picks6mAvg: string | null
  verifiedPct: string | null
  resetCount: number
  lastPickAt: Date | string | null  // proxy: ultimo avistamiento en el listado mensual, no la fecha real del ultimo pick
}

function num(v: string | null): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function daysSince(d: Date | string | null, now: Date): number {
  if (!d) return Infinity
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime()
  if (Number.isNaN(t)) return Infinity
  return (now.getTime() - t) / 86400000
}

// true cuando el yield reciente tiene muestra suficiente para puntuar
export function recentSampleReliable(input: MysScoreInput): boolean {
  const vol = num(input.picks6mAvg)
  return vol !== null && vol * 6 >= RECENT_SAMPLE_MIN
}

export function mysScore(input: MysScoreInput, now: Date = new Date()): number {
  const y = num(input.yield) ?? 0
  const reliable = recentSampleReliable(input)
  const y6 = reliable ? num(input.yield6m) : null
  const y3 = reliable ? num(input.yield3m) : null
  const vol = num(input.picks6mAvg)
  const ver = num(input.verifiedPct)

  const yh = Math.min(Math.max(y, 0), MAX_YIELD_REF) / MAX_YIELD_REF
  const y6c = y6 === null ? NEUTRAL : (Math.min(Math.max(y6, -10), MAX_YIELD_REF) + 10) / (MAX_YIELD_REF + 10)
  const y3c = y3 === null ? NEUTRAL : (Math.min(Math.max(y3, -10), MAX_YIELD_REF) + 10) / (MAX_YIELD_REF + 10)
  const sample = input.picks > MYS_MIN_PICKS
    ? Math.log10(input.picks / MYS_MIN_PICKS) / Math.log10(MAX_PICKS_REF / MYS_MIN_PICKS)
    : 0
  const volc = vol === null ? 0 : Math.min(Math.max(vol, 0), MAX_VOL_REF) / MAX_VOL_REF
  const verc = ver === null ? 0 : Math.min(Math.max(ver, 0), 100) / 100
  const age = daysSince(input.lastPickAt, now)
  const rec = Number.isFinite(age) ? Math.min(1, Math.max(0, 1 - age / RECENCY_DAYS)) : 0

  let s = 0.20 * yh + 0.20 * y6c + 0.10 * y3c + 0.15 * sample + 0.15 * volc + 0.10 * verc + 0.10 * rec
  s *= Math.pow(RESET_FACTOR, Math.min(Math.max(input.resetCount, 0), 4))
  return s
}

export interface MysRanked<T> {
  item: T
  score: number
}

// Ordena por puntuacion; desempates: mas picks, luego id/slug estable.
export function rankTopMys<T extends { picks: number; id?: number; slug?: string }>(
  rows: T[],
  toScore: (row: T) => MysScoreInput,
  now: Date = new Date(),
  limit: number = MYS_TOP_N,
): MysRanked<T>[] {
  return rows
    .map(item => ({ item, score: mysScore(toScore(item), now) }))
    .sort((a, b) =>
      b.score - a.score ||
      b.item.picks - a.item.picks ||
      String(a.item.id ?? a.item.slug ?? '').localeCompare(String(b.item.id ?? b.item.slug ?? '')))
    .slice(0, limit)
}
