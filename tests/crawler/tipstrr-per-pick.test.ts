import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeTipstrrTip, RESULT_CODES } from '@/crawler/platforms/tipstrr/per-pick'

// Regression over a REAL tip captured 2026-11-15 from TLE's /results
// hydration state. Arithmetic verified live: stake 1 @ 3.8 won -> +2.8.
const fixture = JSON.parse(
  readFileSync(
    join(__dirname, '../../crawler/platforms/tipstrr/captures/2026-11-15-tle-results-tip-detail.json'),
    'utf8'
  )
)

describe('tipstrr per-pick schema', () => {
  const pick = normalizeTipstrrTip(fixture.tip)

  it('keeps stake in source units, never money', () => {
    expect(pick.stakeUnits).toBe(1) // 1 Tipstrr unit = "10/10" display
  })

  it('closes the verified arithmetic: 1u @ 3.8 won = +2.8u', () => {
    expect(pick.oddsFinal).toBe(3.8)
    expect(pick.result).toBe('won')
    expect(pick.profitUnits).toBeCloseTo(
      (pick.stakeUnits! * (pick.oddsFinal! - 1)) as number,
      5
    )
  })

  it('maps only verified result codes and keeps the raw code', () => {
    expect(RESULT_CODES).toEqual({ won: 1, lost: 3 })
    expect(pick.resultCode).toBe(1)
    // unverified codes must not be guessed
    expect(normalizeTipstrrTip({ reference: 'x', result: 5 }).result).toBeNull()
    expect(normalizeTipstrrTip({ reference: 'x', result: 5 }).resultCode).toBe(5)
  })

  it('keeps publication and event dates distinct', () => {
    expect(pick.publishedAt).toBe('2026-11-13T07:05:04Z')
    expect(pick.eventDate).toBe('2026-11-14T12:30:00Z')
  })

  it('keeps market/selection and dedup reference', () => {
    expect(pick.reference).toBe('2026-11-14-teplice-v-karvina-02ocv')
    expect(pick.market).toBe('Both teams to score')
    expect(pick.selection).toBe('No')
    expect(pick.eachWay).toBe(false)
    expect(pick.bookmakerId).toBe(17)
  })

  it('preserves the free flag raw; never interprets it as paid', () => {
    // semantics unvalidated (control 2026-11-15); it is just stored
    expect(pick.free).toBe(false)
  })

  it('absence stays null, never 0', () => {
    const sparse = normalizeTipstrrTip({ reference: 'y' })
    expect(sparse.stakeUnits).toBeNull()
    expect(sparse.profitUnits).toBeNull()
    expect(sparse.oddsFinal).toBeNull()
    expect(sparse.result).toBeNull()
    expect(sparse.free).toBeNull()
  })
})
