// MYS evaluation for platform tipsters.
// M (muestra): at least MIN_PICKS picks in the judged sample.
// Y (yield): at least MIN_YIELD_PCT in that SAME sample.
// S (seguibilidad) is NOT decided here: it depends on factors outside the
// stats (access route, platform availability). Free and paid tipsters both
// count as potentially followable; cost is recorded as data, not as an S fail.

export const MYS_MIN_PICKS = 100
export const MYS_MIN_YIELD_PCT = 11

export interface MysSample {
  picks: number | null
  yieldPct: number | null
}

export interface MysResult {
  muestra: boolean | null // null = sample size unknown (absent is not 0)
  yield: boolean | null //   null = yield unknown
  passesMY: boolean | null // null when either input is unknown
}

export function evaluateMys(sample: MysSample): MysResult {
  const muestra = sample.picks === null ? null : sample.picks >= MYS_MIN_PICKS
  const yieldOk = sample.yieldPct === null ? null : sample.yieldPct >= MYS_MIN_YIELD_PCT
  const passesMY = muestra === null || yieldOk === null ? null : muestra && yieldOk
  return { muestra, yield: yieldOk, passesMY }
}
