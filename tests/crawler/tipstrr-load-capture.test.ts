import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  loadTipstrrCapture,
  formatEsEur,
  type TipstrrStatsCapture,
} from '@/crawler/platforms/tipstrr/load-capture'
import {
  TLE_SNAPSHOT,
  STATMIND_SNAPSHOT,
} from '@/app/lab/tipstrr/ficha/fixtures'

// Regression: the loader must regenerate, from the REAL dated captures, the
// same data the reviewed hand-built fixtures carry. Editorial fields
// (platformLabel, stakeLabel, notes, notAvailable) stay human-recorded and
// are passed through, not derived.

const readCapture = (name: string): TipstrrStatsCapture =>
  JSON.parse(
    readFileSync(join(__dirname, '../../crawler/platforms/tipstrr/captures', name), 'utf8')
  )

// Verified account display: units x 10 EUR (unit normalization, not FX).
const eur10 = (u: number) => formatEsEur(u * 10)

const stripValues = (name: string) => name.replace(/ \([^)]*\)$/, '')

const tle = loadTipstrrCapture(readCapture('2026-11-15-tle-stats-state.json'), {
  sourceUrl: TLE_SNAPSHOT.sourceUrl,
  capturedAt: TLE_SNAPSHOT.capturedAt,
  capturedAtDate: TLE_SNAPSHOT.capturedAtDate,
  formatMoney: eur10,
  editorial: {
    platformLabel: TLE_SNAPSHOT.platformLabel,
    stakeLabel: TLE_SNAPSHOT.overview.stakeLabel,
    roiPeriodLabel: TLE_SNAPSHOT.overview.roiPeriodLabel,
    activeTipsNow: TLE_SNAPSHOT.activeTipsNow, // observed on page; state said 0
    lastResultVisibleLabel: TLE_SNAPSHOT.lastResultVisibleLabel,
    yieldEquivalenceNote: TLE_SNAPSHOT.yieldEquivalenceNote,
    notAvailable: TLE_SNAPSHOT.notAvailable,
  },
})

const statmind = loadTipstrrCapture(readCapture('2026-11-15-statmind-stats-state.json'), {
  sourceUrl: STATMIND_SNAPSHOT.sourceUrl,
  capturedAt: STATMIND_SNAPSHOT.capturedAt,
  capturedAtDate: STATMIND_SNAPSHOT.capturedAtDate,
  formatMoney: eur10,
  editorial: {
    platformLabel: STATMIND_SNAPSHOT.platformLabel,
    stakeLabel: STATMIND_SNAPSHOT.overview.stakeLabel,
    roiPeriodLabel: STATMIND_SNAPSHOT.overview.roiPeriodLabel,
    lastResultVisibleLabel: STATMIND_SNAPSHOT.lastResultVisibleLabel,
    yieldEquivalenceNote: STATMIND_SNAPSHOT.yieldEquivalenceNote,
    notAvailable: STATMIND_SNAPSHOT.notAvailable,
  },
})

describe.each([
  ['TLE', tle, TLE_SNAPSHOT],
  ['StatMind', statmind, STATMIND_SNAPSHOT],
] as const)('loadTipstrrCapture regenerates the reviewed %s snapshot', (_n, got, want) => {
  it('identity fields', () => {
    expect(got.name).toBe(want.name)
    expect(got.signupDate).toBe(want.signupDate)
    expect(got.avatarUrl).toBe(want.avatarUrl)
    expect(got.sourceUrl).toBe(want.sourceUrl)
    expect(got.activeTipsNow).toBe(want.activeTipsNow)
  })

  it('exact monthly series (monthState)', () => {
    expect(got.monthState).toEqual(want.monthState)
  })

  it('monthly table rows (labels, closed, partial, figures)', () => {
    expect(got.months).toEqual(want.months)
  })

  it('overview figures incl. EUR display from exact monthly sum', () => {
    // winRatePct: the ficha records the page's display rounding (TLE shows
    // 35.76, StatMind shows 32); the loader keeps source precision.
    expect({ ...got.overview, winRatePct: null }).toEqual({ ...want.overview, winRatePct: null })
    expect(got.overview.winRatePct).not.toBeNull()
    expect(Math.round(got.overview.winRatePct!)).toBe(Math.round(want.overview.winRatePct!))
  })

  it('consistency checks: same checks, all passing', () => {
    expect(got.consistency.length).toBe(want.consistency.length)
    got.consistency.forEach((c, i) => {
      expect(stripValues(c.name)).toBe(stripValues(want.consistency[i].name))
      expect(c.passed).toBe(want.consistency[i].passed)
    })
  })
})

describe('formatEsEur', () => {
  it('groups es-ES with sign', () => {
    expect(formatEsEur(3618.15)).toBe('+3.618,15 €')
    expect(formatEsEur(-591.25)).toBe('-591,25 €')
    expect(formatEsEur(-412.05)).toBe('-412,05 €')
    expect(formatEsEur(138)).toBe('+138,00 €')
    expect(formatEsEur(3618.15, false)).toBe('3.618,15 €')
  })
})
