import { describe, it, expect } from 'vitest'
import {
  decodeTipstrrState,
  parseOverview,
  parseStakeBands,
  stakeUniformity,
  assessTipstrrMys,
  parseMonthlyBreakdown,
  computePeriodStats,
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

  it('computePeriodStats uses only closed months, never invents zeros', () => {
    const rows = parseMonthlyBreakdown(`<html><body>${monthTable}</body></html>`)
    const p = computePeriodStats(rows, new Date('2026-11-15T12:00:00Z'))
    // closed: Oct + Sep. stakedOct = 179.20/0.183, stakedSep = 100/0.067
    const staked = 179.2 / 0.183 + 100 / 0.067
    const expected = ((-179.2 + 100) / staked) * 100
    expect(p.yield3m).toBeCloseTo(expected, 6)
    expect(p.picks6mAvg).toBeCloseTo((98 + 150) / 2, 6)
    // with Nov excluded; if only the current month exists -> nulls
    const onlyCurrent = rows.filter((r) => r.label === 'Nov 2026')
    const p2 = computePeriodStats(onlyCurrent, new Date('2026-11-15T12:00:00Z'))
    expect(p2.yield3m).toBeNull()
    expect(p2.picks6mAvg).toBeNull()
  })

  it('parseProfileHeader reads portfolio facts from state', () => {
    const html = pageWith(UNIFORM_STATE, '')
    const h = parseProfileHeader(html)
    expect(h).toMatchObject({ name: 'Demo Flat', isPaid: false, dateCreated: null, avatarUrl: null })
  })
})
