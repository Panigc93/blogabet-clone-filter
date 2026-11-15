import { describe, it, expect } from 'vitest'
import {
  decodeTipstrrState,
  parseOverview,
  parseStakeBands,
  stakeUniformity,
  assessTipstrrMys,
  parseMonthlyBreakdown,
  parseMonthlyState,
  computeExactPeriodStats,
  parseMoneyLabel,
  parseProfileHeader,
} from '@/crawler/platforms/tipstrr/stats-state'

// FABRICATED fixtures: invented tipsters and figures. Only the STRUCTURE
// mimics what was observed live on tipstrr.com (2026-11-15): a
// <script id="tipstrr-state"> with '"' encoded as &q;, a PORTFOLIO object
// keyed "<slug>_" with an overview block, and a stake-band table. No real
// page content is stored here.

function encodeState(state: unknown): string {
  return JSON.stringify(state).replace(/"/g, '&q;')
}

function pageWith(state: unknown, stakeRows: string): string {
  return `<html><body>
    <script id="tipstrr-state" type="application/json">${encodeState(state)}</script>
    <table><thead><tr><th>Stake</th><th>Tips</th><th>Win rate</th><th>Profit</th><th>ROI</th></tr></thead>
    <tbody>${stakeRows}</tbody></table>
  </body></html>`
}

function stakeRow(band: string, tips: number, profit: string, roi: string): string {
  return `<tr><td>${band}</td><td>${tips}</td><td>50%</td><td>${profit}</td><td>${roi}</td></tr>`
}

// Uniform-stake tipster shaped like the verified StatMind case: every check
// closes (tips 291, avgStake 1, advised == level, roi = profit/staked).
const UNIFORM_STATE = {
  SERVER_DATE: '2026-11-15T12:00:00.000Z',
  PORTFOLIO: {
    'demo-flat_': {
      name: 'Demo Flat',
      overview: {
        tips: 291,
        profit: -59.13,
        levelStakeProfit: -59.13,
        roi: -20.32,
        levelStakeROI: -20.32,
        averageStake: 1,
        winPercentage: 31.62,
        period: 3,
        dateGenerated: '2026-11-09T03:35:50Z',
      },
    },
  },
}

// Monthly state shaped like the verified the-least-expected case: exact
// staked per month, flat 1u staking (staked == tips).
const MONTHS_STATE = {
  STATS_MONTH: {
    'demo-flat_6': [
      { date: '2026-11-01T00:00:00Z', tips: 37, staked: 37, profit: 13.8, roi: 37.3, winPercentage: 41, averageOdds: 3.31, void: 0 },
      { date: '2026-10-01T00:00:00Z', tips: 78, staked: 78, profit: 27.25, roi: 34.94, winPercentage: 41, averageOdds: 3.41, void: 0 },
      { date: '2026-09-01T00:00:00Z', tips: 106, staked: 106, profit: 19.1, roi: 18.02, winPercentage: 34, averageOdds: 3.48, void: 0 },
      { date: '2026-08-01T00:00:00Z', tips: 136, staked: 136, profit: 35.25, roi: 25.92, winPercentage: 38, averageOdds: 3.33, void: 0 },
    ],
  },
}

// A zero-profit month: the exact-staked path must keep it in the period.
const ZERO_PROFIT_STATE = {
  STATS_MONTH: {
    'demo-flat_6': [
      { date: '2026-11-01T00:00:00Z', tips: 10, staked: 10, profit: 5, roi: 50, winPercentage: 60, averageOdds: 2.5, void: 0 },
      { date: '2026-10-01T00:00:00Z', tips: 50, staked: 50, profit: 10, roi: 20, winPercentage: 55, averageOdds: 2.4, void: 0 },
      { date: '2026-09-01T00:00:00Z', tips: 50, staked: 50, profit: 0, roi: 0, winPercentage: 50, averageOdds: 2.3, void: 0 },
    ],
  },
}

// Mixed-stake tipster shaped like the VB TIPS case: bases diverge and the
// stake table has several bands.
const MIXED_STATE = {
  PORTFOLIO: {
    'demo-mixed_': {
      name: 'Demo Mixed',
      overview: {
        tips: 956,
        profit: -25.46,
        levelStakeProfit: -97.23,
        roi: -1.27,
        levelStakeROI: -2.8,
        averageStake: 0.78,
        winPercentage: 42.31,
        period: 5,
        dateGenerated: '2026-11-09T03:35:50Z',
      },
    },
  },
}

describe('decodeTipstrrState', () => {
  it('decodes &q;-encoded JSON', () => {
    const state = decodeTipstrrState(pageWith(UNIFORM_STATE, ''))
    expect(state?.SERVER_DATE).toBe('2026-11-15T12:00:00.000Z')
  })
  it('returns null when the script is absent or malformed', () => {
    expect(decodeTipstrrState('<html><body>no state</body></html>')).toBeNull()
    expect(decodeTipstrrState('<script id="tipstrr-state">not json</script>')).toBeNull()
  })
})

describe('parseOverview', () => {
  it('extracts both stake bases and sample fields', () => {
    const o = parseOverview(pageWith(UNIFORM_STATE, ''))
    expect(o).toMatchObject({
      slug: 'demo-flat',
      tips: 291,
      profitUnits: -59.13,
      roiPct: -20.32,
      levelStakeProfitUnits: -59.13,
      levelStakeRoiPct: -20.32,
      averageStakeUnits: 1,
      winRatePct: 31.62,
      periodMonths: 3,
    })
  })
  it('returns null without portfolio state', () => {
    expect(parseOverview('<html></html>')).toBeNull()
  })
})

describe('parseStakeBands + stakeUniformity', () => {
  it('reads bands from the stake table', () => {
    const html = pageWith(UNIFORM_STATE, stakeRow('10 / 10', 291, '-£591.25', '-20.3%'))
    const bands = parseStakeBands(html)
    expect(bands).toEqual([{ band: '10 / 10', numerator: 10, denominator: 10, tips: 291 }])
    expect(stakeUniformity(bands)).toBe('uniform')
  })
  it('detects mixed staking', () => {
    const html = pageWith(MIXED_STATE, stakeRow('5 / 10', 73, '£435.17', '41.1%') + stakeRow('10 / 10', 841, '-£723.98', '-8.6%'))
    expect(stakeUniformity(parseStakeBands(html))).toBe('mixed')
  })
  it('unknown when no bands', () => {
    expect(stakeUniformity([])).toBe('unknown')
  })
})

describe('assessTipstrrMys', () => {
  it('uniform + all consistency checks: yield is evaluable, M/Y real', () => {
    const html = pageWith(UNIFORM_STATE, stakeRow('10 / 10', 291, '-£591.25', '-20.3%'))
    const a = assessTipstrrMys(parseOverview(html)!, parseStakeBands(html))
    expect(a.yieldEvaluable).toBe(true)
    expect(a.muestra).toBe(true) // 291 >= 100
    expect(a.yield).toBe(false) // -20.32 < 11
    expect(a.passesMY).toBe(false)
    expect(a.sourceRoiPct).toBe(-20.32)
    expect(a.consistencyChecks.every((c) => c.passed)).toBe(true)
  })

  it('uniform stake alone is NOT sufficient: diverging bases block Y', () => {
    // single band but advised != level and arithmetic does not close
    const inconsistent = {
      PORTFOLIO: {
        'demo-bad_': {
          overview: { tips: 291, profit: -59.13, levelStakeProfit: -10, roi: -20.32, levelStakeROI: -3.4, averageStake: 1 },
        },
      },
    }
    const html = pageWith(inconsistent, stakeRow('10 / 10', 291, '-£591.25', '-20.3%'))
    const a = assessTipstrrMys(parseOverview(html)!, parseStakeBands(html))
    expect(a.yieldEvaluable).toBe(false)
    expect(a.yield).toBeNull()
    expect(a.passesMY).toBeNull()
    expect(a.muestra).toBe(true) // sample size still known
    expect(a.sourceRoiPct).toBe(-20.32) // preserved as source metric
    expect(a.note).toMatch(/NO usar como yield/)
  })

  it('mixed staking: Y not evaluable, ROI preserved source-only', () => {
    const html = pageWith(MIXED_STATE, stakeRow('5 / 10', 73, '£435.17', '41.1%') + stakeRow('10 / 10', 841, '-£723.98', '-8.6%'))
    const a = assessTipstrrMys(parseOverview(html)!, parseStakeBands(html))
    expect(a.yieldEvaluable).toBe(false)
    expect(a.muestra).toBe(true) // 956 >= 100 is still known
    expect(a.yield).toBeNull()
    expect(a.passesMY).toBeNull()
    expect(a.sourceRoiPct).toBe(-1.27)
  })

  it('ROI >= 11 is never promoted to Y without the checks', () => {
    const hotMixed = {
      PORTFOLIO: {
        'demo-hot_': {
          overview: { tips: 500, profit: 80, levelStakeProfit: 30, roi: 15.2, levelStakeROI: 9.1, averageStake: 0.6 },
        },
      },
    }
    const html = pageWith(hotMixed, stakeRow('5 / 10', 200, '£100', '10%') + stakeRow('10 / 10', 300, '£200', '12%'))
    const a = assessTipstrrMys(parseOverview(html)!, parseStakeBands(html))
    expect(a.yieldEvaluable).toBe(false)
    expect(a.yield).toBeNull()
    expect(a.passesMY).toBeNull()
  })

  it('missing overview: everything unknown, never zero', () => {
    const a = assessTipstrrMys(
      { slug: 'x', tips: null, profitUnits: null, roiPct: null, levelStakeProfitUnits: null, levelStakeRoiPct: null, averageStakeUnits: null, winRatePct: null, periodMonths: null, dateGenerated: null },
      [],
    )
    expect(a.yieldEvaluable).toBe(false)
    expect(a.muestra).toBeNull()
    expect(a.yield).toBeNull()
    expect(a.passesMY).toBeNull()
  })
})

describe('BB-parity extraction (fabricated fixtures)', () => {
  const monthTable = `<table><thead><tr><th>Month</th><th>Tips</th><th>Win rate</th><th>Profit</th><th>ROI</th><th>Avg. odds</th></tr></thead><tbody>
    <tr><td>Nov 2026</td><td>193</td><td>32%</td><td>-£412.05</td><td>-21.4%</td><td>3.01</td></tr>
    <tr><td>Oct 2026</td><td>98</td><td>32%</td><td>-£179.20</td><td>-18.3%</td><td>2.76</td></tr>
    <tr><td>Sep 2026</td><td>150</td><td>40%</td><td>£100.00</td><td>6.7%</td><td>2.50</td></tr>
  </tbody></table>`

  it('parses monthly breakdown rows with currency and roi', () => {
    const rows = parseMonthlyBreakdown(`<html><body>${monthTable}</body></html>`)
    expect(rows).toHaveLength(3)
    expect(rows[1]).toMatchObject({ label: 'Oct 2026', year: 2026, month: 10, tips: 98, profitAmount: -179.2, roiPct: -18.3, avgOdds: 2.76 })
  })

  it('parseMoneyLabel handles signs, separators, currencies; rejects junk', () => {
    expect(parseMoneyLabel('-£1,217.01')).toBe(-1217.01)
    expect(parseMoneyLabel('£1,425.78')).toBe(1425.78)
    expect(parseMoneyLabel('€47.47')).toBe(47.47)
    expect(parseMoneyLabel('n/a')).toBeNull()
  })

  it('computeExactPeriodStats sums exact staked/profit over closed months only', () => {
    const rows = parseMonthlyState(pageWith(MONTHS_STATE, ''))
    expect(rows).toHaveLength(4)
    const p = computeExactPeriodStats(rows, new Date('2026-11-15T12:00:00Z'))
    // closed: Oct + Sep + Aug (Nov in progress excluded)
    expect(p.yield3m).not.toBeNull()
    expect(p.yield3m!.tips).toBe(78 + 106 + 136)
    expect(p.yield3m!.staked).toBe(78 + 106 + 136)
    expect(p.yield3m!.yieldPct).toBeCloseTo(((27.25 + 19.1 + 35.25) / 320) * 100, 6)
    expect(p.yield3m!.from).toBe('2026-08')
    expect(p.yield3m!.to).toBe('2026-10')
    expect(p.picks6mAvg).toBeCloseTo((78 + 106 + 136) / 3, 6)
    // 12m asked with only 3 closed months: uses what exists, never invents
    expect(p.yield12m!.months).toBe(3)
    // only the current month -> nulls, never zero
    const onlyCurrent = rows.filter((r) => r.year === 2026 && r.month === 11)
    const p2 = computeExactPeriodStats(onlyCurrent, new Date('2026-11-15T12:00:00Z'))
    expect(p2.yield3m).toBeNull()
    expect(p2.picks6mAvg).toBeNull()
  })

  it('regression: exact staked is used, never a denominator derived from rounded roi', () => {
    // Aug has profit 0: profit/roi would make the month vanish or divide by
    // zero in the old estimator. With exact staked it must count normally.
    const rows = parseMonthlyState(pageWith(ZERO_PROFIT_STATE, ''))
    const p = computeExactPeriodStats(rows, new Date('2026-11-15T12:00:00Z'))
    expect(p.yield3m!.tips).toBe(50 + 50)
    expect(p.yield3m!.staked).toBe(100)
    expect(p.yield3m!.yieldPct).toBeCloseTo((10 / 100) * 100, 6)
  })

  it('parseProfileHeader reads portfolio facts from state', () => {
    const html = pageWith(UNIFORM_STATE, '')
    const h = parseProfileHeader(html)
    expect(h).toMatchObject({ name: 'Demo Flat', isPaid: false, dateCreated: null, avatarUrl: null })
  })
})
